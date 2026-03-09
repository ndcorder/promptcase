import type {
  PromptEntry,
  PromptFile,
  CommitEntry,
  DiffResult,
  ResolvedPrompt,
  LintResult,
  SearchResult,
  RepoStatus,
  RepoConfig,
  VariableDefinition,
} from "./types";

let requestId = 0;

type RpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

type RpcCallback = (response: RpcResponse) => void;
const pendingRequests = new Map<number, RpcCallback>();

let sidecarProcess: { write: (data: string) => void } | null = null;
let outputBuffer = "";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function initSidecar(): Promise<void> {
  if (sidecarProcess) return;

  if (isTauri()) {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const cmd = Command.sidecar("promptcase-sidecar");
    const child = await cmd.spawn();

    cmd.stdout.on("data", (data: string) => {
      outputBuffer += data;
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line) as RpcResponse;
          if ("id" in response && response.id != null) {
            const callback = pendingRequests.get(response.id);
            if (callback) {
              pendingRequests.delete(response.id);
              callback(response);
            }
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    cmd.stderr.on("data", (data: string) => {
      console.error("[sidecar stderr]", data);
    });

    cmd.on("close", () => {
      sidecarProcess = null;
      for (const [id, callback] of pendingRequests) {
        pendingRequests.delete(id);
        callback({
          jsonrpc: "2.0",
          id,
          error: { code: -1, message: "sidecar crashed" },
        });
      }
    });

    sidecarProcess = {
      write: (data: string) => child.write(data + "\n"),
    };
  }
}

async function rpcCall<T>(method: string, params?: unknown): Promise<T> {
  if (isTauri()) {
    if (!sidecarProcess) {
      await initSidecar();
    }
    const id = ++requestId;
    const request = { jsonrpc: "2.0", id, method, params };

    return new Promise<T>((resolve, reject) => {
      pendingRequests.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result as T);
        }
      });
      sidecarProcess!.write(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error(`RPC call ${method} timed out`));
        }
      }, 30000);
    });
  }

  // Dev mode: direct HTTP fallback or mock
  return mockRpcCall<T>(method, params);
}

// Mock implementation for development without Tauri
// Persist to localStorage so data survives page reloads
const MOCK_STORAGE_KEY = "promptcase-mock-files";

function loadMockFiles(): Map<string, PromptFile> {
  try {
    const stored = localStorage.getItem(MOCK_STORAGE_KEY);
    if (stored) {
      const entries: [string, PromptFile][] = JSON.parse(stored);
      return new Map(entries);
    }
  } catch {
    // ignore corrupt data
  }
  return new Map();
}

function saveMockFiles(): void {
  try {
    localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify([...mockFiles.entries()]),
    );
  } catch {
    // ignore quota errors
  }
}

const mockFiles = loadMockFiles();

function mockRpcCall<T>(method: string, params?: unknown): Promise<T> {
  const p = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "ping":
      return Promise.resolve({ pong: true } as T);

    case "config.get":
      return Promise.resolve({
        version: 1,
        default_model: "claude-sonnet-4",
        auto_commit: true,
        commit_prefix: "[promptcase]",
        token_count_models: ["claude-sonnet-4", "gpt-4o"],
        lint_rules: {},
      } as T);

    case "file.list":
      return Promise.resolve(
        [...mockFiles.values()].map((f) => ({
          path: f.path,
          frontmatter: f.frontmatter,
        })) as T,
      );

    case "file.read":
      return Promise.resolve(mockFiles.get(p.path as string) as T);

    case "file.create": {
      const now = new Date().toISOString();
      const file: PromptFile = {
        path: p.path as string,
        frontmatter: {
          id: Math.random().toString(16).slice(2, 10),
          title: (p.title as string) || "Untitled",
          type: (p.type as "prompt" | "fragment") || "prompt",
          tags: [],
          folder:
            "/" +
            (p.path as string)
              .split("/")
              .slice(0, -1)
              .join("/"),
          variables: [],
          includes: [],
          created: now,
          modified: now,
          starred_versions: [],
        },
        body: "\n",
        raw: "",
      };
      mockFiles.set(file.path, file);
      saveMockFiles();
      return Promise.resolve(file as T);
    }

    case "file.write": {
      const existing = mockFiles.get(p.path as string);
      if (existing) {
        if (p.frontmatter) Object.assign(existing.frontmatter, p.frontmatter as object);
        if (p.body != null) existing.body = p.body as string;
        existing.frontmatter.modified = new Date().toISOString();
      }
      saveMockFiles();
      return Promise.resolve({ ok: true } as T);
    }

    case "file.delete":
      mockFiles.delete(p.path as string);
      saveMockFiles();
      return Promise.resolve({ ok: true } as T);

    case "file.move": {
      const file = mockFiles.get(p.from as string);
      if (file) {
        mockFiles.delete(p.from as string);
        file.path = p.to as string;
        mockFiles.set(file.path, file);
      }
      saveMockFiles();
      return Promise.resolve({ ok: true } as T);
    }

    case "git.status":
      return Promise.resolve({
        initialized: true,
        clean: true,
        totalFiles: mockFiles.size,
        repoPath: "~/prompts",
      } as T);

    case "git.log":
      return Promise.resolve([] as T);

    case "tokens.count":
      return Promise.resolve(
        Math.ceil(((p.text as string) || "").length / 4) as T,
      );

    case "search.query":
      return Promise.resolve([] as T);

    case "template.lint":
      return Promise.resolve([] as T);

    case "template.resolve":
      return Promise.resolve({
        text: mockFiles.get(p.path as string)?.body || "",
        variables: {},
        unresolvedVariables: [],
        includedFragments: [],
      } as T);

    case "template.variables":
      return Promise.resolve([] as T);

    case "template.lint_all":
      return Promise.resolve({} as T);

    case "tokens.count_resolved":
      return Promise.resolve(
        Math.ceil(((mockFiles.get(p.path as string)?.body || "").length) / 4) as T,
      );

    case "search.reindex":
      return Promise.resolve({ ok: true } as T);

    case "git.diff":
      return Promise.resolve({ additions: [], deletions: [], hunks: [] } as T);

    case "git.restore":
      return Promise.resolve(null as T);

    default:
      return Promise.reject(new Error(`Mock: Unknown method ${method}`));
  }
}

// Public API
export const api = {
  // File operations
  listFiles: () => rpcCall<PromptEntry[]>("file.list"),
  readFile: (path: string) => rpcCall<PromptFile>("file.read", { path }),
  writeFile: (path: string, frontmatter?: object, body?: string) =>
    rpcCall<{ ok: boolean }>("file.write", { path, frontmatter, body }),
  createFile: (
    path: string,
    title: string,
    type: "prompt" | "fragment" = "prompt",
    template?: string,
  ) => rpcCall<PromptFile>("file.create", { path, title, type, template }),
  deleteFile: (path: string) =>
    rpcCall<{ ok: boolean }>("file.delete", { path }),
  moveFile: (from: string, to: string) =>
    rpcCall<{ ok: boolean }>("file.move", { from, to }),

  // Git operations
  gitLog: (path?: string, limit?: number) =>
    rpcCall<CommitEntry[]>("git.log", { path, limit }),
  gitDiff: (path: string, commitA: string, commitB: string) =>
    rpcCall<DiffResult>("git.diff", { path, commitA, commitB }),
  gitRestore: (path: string, commit: string) =>
    rpcCall<string | null>("git.restore", { path, commit }),
  gitStatus: () => rpcCall<RepoStatus>("git.status"),

  // Template operations
  resolveTemplate: (path: string, variables?: Record<string, string>) =>
    rpcCall<ResolvedPrompt>("template.resolve", { path, variables }),
  lintFile: (path: string) =>
    rpcCall<LintResult[]>("template.lint", { path }),
  lintAll: () =>
    rpcCall<Record<string, LintResult[]>>("template.lint_all"),
  getVariables: (path: string) =>
    rpcCall<VariableDefinition[]>("template.variables", { path }),

  // Token counting
  countTokens: (text: string, model: string) =>
    rpcCall<number>("tokens.count", { text, model }),
  countTokensResolved: (
    path: string,
    model: string,
    variables?: Record<string, string>,
  ) => rpcCall<number>("tokens.count_resolved", { path, model, variables }),

  // Search
  search: (q: string, filters?: object) =>
    rpcCall<SearchResult[]>("search.query", { q, filters }),
  reindex: () => rpcCall<{ ok: boolean }>("search.reindex"),

  // Config
  getConfig: () => rpcCall<RepoConfig>("config.get"),
};
