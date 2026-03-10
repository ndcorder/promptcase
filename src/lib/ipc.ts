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

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  return mockCall<T>(command, args);
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

function mockCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const p = (args ?? {}) as Record<string, unknown>;

  switch (command) {
    case "get_config":
      return Promise.resolve({
        version: 1,
        defaultModel: "claude-sonnet-4",
        autoCommit: true,
        commitPrefix: "[promptcase]",
        tokenCountModels: ["claude-sonnet-4", "gpt-4o"],
        lintRules: {},
      } as T);

    case "list_files":
      return Promise.resolve(
        [...mockFiles.values()].map((f) => ({
          path: f.path,
          frontmatter: f.frontmatter,
        })) as T,
      );

    case "read_file":
      return Promise.resolve(mockFiles.get(p.path as string) as T);

    case "create_file": {
      const now = new Date().toISOString();
      const file: PromptFile = {
        path: p.path as string,
        frontmatter: {
          id: Math.random().toString(16).slice(2, 10),
          title: (p.title as string) || "Untitled",
          type: (p.prompt_type as "prompt" | "fragment") || "prompt",
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
          starredVersions: [],
        },
        body: "\n",
        raw: "",
      };
      mockFiles.set(file.path, file);
      saveMockFiles();
      return Promise.resolve(file as T);
    }

    case "write_file": {
      const existing = mockFiles.get(p.path as string);
      if (existing) {
        if (p.frontmatter) Object.assign(existing.frontmatter, p.frontmatter as object);
        if (p.body != null) existing.body = p.body as string;
        existing.frontmatter.modified = new Date().toISOString();
      }
      saveMockFiles();
      return Promise.resolve({ ok: true } as T);
    }

    case "delete_file":
      mockFiles.delete(p.path as string);
      saveMockFiles();
      return Promise.resolve({ ok: true } as T);

    case "move_file": {
      const file = mockFiles.get(p.from as string);
      if (file) {
        mockFiles.delete(p.from as string);
        file.path = p.to as string;
        mockFiles.set(file.path, file);
      }
      saveMockFiles();
      return Promise.resolve({ ok: true } as T);
    }

    case "git_status":
      return Promise.resolve({
        initialized: true,
        clean: true,
        totalFiles: mockFiles.size,
        repoPath: "~/prompts",
      } as T);

    case "git_log":
      return Promise.resolve([] as T);

    case "git_diff":
      return Promise.resolve({ raw: "", hunks: [] } as T);

    case "git_restore":
      return Promise.resolve(null as T);

    case "count_tokens":
      return Promise.resolve(
        Math.ceil(((p.text as string) || "").length / 4) as T,
      );

    case "count_tokens_resolved":
      return Promise.resolve(
        Math.ceil(((mockFiles.get(p.path as string)?.body || "").length) / 4) as T,
      );

    case "search_query":
      return Promise.resolve([] as T);

    case "search_reindex":
      return Promise.resolve({ ok: true } as T);

    case "lint_file":
      return Promise.resolve([] as T);

    case "lint_all":
      return Promise.resolve({} as T);

    case "resolve_template":
      return Promise.resolve({
        text: mockFiles.get(p.path as string)?.body || "",
        variables: {},
        unresolvedVariables: [],
        includedFragments: [],
      } as T);

    case "get_variables":
      return Promise.resolve([] as T);

    default:
      return Promise.reject(new Error(`Mock: Unknown command ${command}`));
  }
}

// Public API - these match the Tauri command names exactly (snake_case)
export const api = {
  // File operations
  listFiles: () => call<PromptEntry[]>("list_files"),
  readFile: (path: string) => call<PromptFile>("read_file", { path }),
  writeFile: (path: string, frontmatter?: object, body?: string) =>
    call<{ ok: boolean }>("write_file", { path, frontmatter, body }),
  createFile: (
    path: string,
    title: string,
    type: "prompt" | "fragment" = "prompt",
    template?: string,
  ) => call<PromptFile>("create_file", { path, title, prompt_type: type, template }),
  deleteFile: (path: string) =>
    call<{ ok: boolean }>("delete_file", { path }),
  moveFile: (from: string, to: string) =>
    call<{ ok: boolean }>("move_file", { from, to }),

  // Git operations
  gitLog: (path?: string, limit?: number) =>
    call<CommitEntry[]>("git_log", { path, limit }),
  gitDiff: (path: string, commitA: string, commitB: string) =>
    call<DiffResult>("git_diff", { path, commit_a: commitA, commit_b: commitB }),
  gitRestore: (path: string, commit: string) =>
    call<string | null>("git_restore", { path, commit }),
  gitStatus: () => call<RepoStatus>("git_status"),

  // Template operations
  resolveTemplate: (path: string, variables?: Record<string, string>) =>
    call<ResolvedPrompt>("resolve_template", { path, variables }),
  lintFile: (path: string) =>
    call<LintResult[]>("lint_file", { path }),
  lintAll: () =>
    call<Record<string, LintResult[]>>("lint_all"),
  getVariables: (path: string) =>
    call<VariableDefinition[]>("get_variables", { path }),

  // Token counting
  countTokens: (text: string, model: string) =>
    call<number>("count_tokens", { text, model }),
  countTokensResolved: (
    path: string,
    model: string,
    variables?: Record<string, string>,
  ) => call<number>("count_tokens_resolved", { path, model, variables }),

  // Search
  search: (q: string, filters?: object) =>
    call<SearchResult[]>("search_query", { q, filters }),
  reindex: () => call<{ ok: boolean }>("search_reindex"),

  // Config
  getConfig: () => call<RepoConfig>("get_config"),
};
