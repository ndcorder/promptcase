import { FileOps } from "./file-ops.ts";
import { GitOps } from "./git-ops.ts";
import { resolveTemplate } from "./template.ts";
import { lintPrompt, lintAll } from "./linter.ts";
import { countTokens } from "./tokenizer.ts";
import { PromptSearch } from "./search.ts";
import type { RpcRequest, RpcResponse, RepoConfig } from "./types.ts";
import { DEFAULT_CONFIG } from "./types.ts";

export class RpcHandler {
  private fileOps: FileOps;
  private gitOps: GitOps;
  private search: PromptSearch;
  private config: RepoConfig;
  private repoRoot: string;

  constructor(repoRoot: string, config?: Partial<RepoConfig>) {
    this.repoRoot = repoRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gitOps = new GitOps(repoRoot, this.config.commit_prefix);
    this.fileOps = new FileOps(repoRoot, this.config, this.gitOps);
    this.search = new PromptSearch();
  }

  async init(): Promise<void> {
    await this.gitOps.init();
    await this.rebuildIndex();
  }

  async rebuildIndex(): Promise<void> {
    this.search.clear();
    const entries = await this.fileOps.listAll();
    for (const entry of entries) {
      try {
        const file = await this.fileOps.read(entry.path);
        this.search.addDocument(entry, file.body);
      } catch {
        // skip unreadable
      }
    }
  }

  async handle(request: RpcRequest): Promise<RpcResponse> {
    try {
      const result = await this.dispatch(request.method, request.params);
      return { jsonrpc: "2.0", id: request.id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>;

    switch (method) {
      // File operations
      case "file.list":
        return this.fileOps.listAll();

      case "file.read":
        return this.fileOps.read(p.path as string);

      case "file.write": {
        const file = await this.fileOps.read(p.path as string);
        const fm = { ...file.frontmatter, ...(p.frontmatter as object ?? {}) };
        const body = (p.body as string) ?? file.body;
        await this.fileOps.write(p.path as string, fm, body);
        // Update search index from in-memory data
        this.search.addDocument(
          { path: p.path as string, frontmatter: fm },
          body,
        );
        return { ok: true };
      }

      case "file.create": {
        const result = await this.fileOps.create(
          p.path as string,
          (p.title as string) || "Untitled",
          (p.type as "prompt" | "fragment") || "prompt",
          p.template as string | undefined,
        );
        this.search.addDocument(
          { path: result.path, frontmatter: result.frontmatter },
          result.body,
        );
        return result;
      }

      case "file.delete":
        await this.fileOps.delete(p.path as string);
        this.search.removeDocument(p.path as string);
        return { ok: true };

      case "file.move":
        await this.fileOps.move(p.from as string, p.to as string);
        this.search.removeDocument(p.from as string);
        const moved = await this.fileOps.read(p.to as string);
        this.search.addDocument(
          { path: moved.path, frontmatter: moved.frontmatter },
          moved.body,
        );
        return { ok: true };

      // Git operations
      case "git.log":
        return this.gitOps.log(
          p.path as string | undefined,
          p.limit as number | undefined,
        );

      case "git.diff":
        return this.gitOps.diff(
          p.path as string,
          p.commitA as string,
          p.commitB as string,
        );

      case "git.restore":
        return this.gitOps.restore(p.path as string, p.commit as string);

      case "git.status":
        return this.gitOps.status();

      // Template operations
      case "template.resolve": {
        const filePath = p.path as string;
        const content = await this.fileOps.readRaw(filePath);
        return resolveTemplate(filePath, content, {
          repoRoot: this.repoRoot,
          variables: p.variables as Record<string, string> | undefined,
        });
      }

      case "template.lint": {
        const filePath = p.path as string;
        const content = await this.fileOps.readRaw(filePath);
        return lintPrompt(filePath, content, {
          repoRoot: this.repoRoot,
          config: this.config,
        });
      }

      case "template.lint_all": {
        const entries = await this.fileOps.listAll();
        const files = await Promise.all(
          entries.map(async (e) => ({
            path: e.path,
            content: await this.fileOps.readRaw(e.path),
          })),
        );
        return lintAll(files, {
          repoRoot: this.repoRoot,
          config: this.config,
        });
      }

      case "template.variables": {
        const filePath = p.path as string;
        const file = await this.fileOps.read(filePath);
        return file.frontmatter.variables;
      }

      // Token counting
      case "tokens.count":
        return countTokens(
          p.text as string,
          p.model as string,
        );

      case "tokens.count_resolved": {
        const filePath = p.path as string;
        const content = await this.fileOps.readRaw(filePath);
        const resolved = await resolveTemplate(filePath, content, {
          repoRoot: this.repoRoot,
          variables: p.variables as Record<string, string> | undefined,
        });
        return countTokens(resolved.text, p.model as string);
      }

      // Search
      case "search.query":
        return this.search.search(
          p.q as string,
          p.filters as Record<string, string> | undefined,
        );

      case "search.reindex":
        await this.rebuildIndex();
        return { ok: true };

      // Meta
      case "ping":
        return { pong: true };

      case "config.get":
        return this.config;

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}
