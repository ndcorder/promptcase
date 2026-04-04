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
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function ensureTauri(): void {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available. Promptcase requires the Tauri desktop shell.");
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  ensureTauri();
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

// Public API - these match the Tauri command names exactly (snake_case)
export const api = {
  // File operations
  listFiles: () => call<PromptEntry[]>("list_files"),
  listFolders: () => call<string[]>("list_folders"),
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

  // Folder operations
  createFolder: (path: string) =>
    call<{ ok: boolean }>("create_folder", { path }),
  renameFolder: (from: string, to: string) =>
    call<{ ok: boolean }>("rename_folder", { from, to }),
  deleteFolder: (path: string) =>
    call<{ ok: boolean }>("delete_folder", { path }),

  // Duplicate
  duplicateFile: (path: string) =>
    call<PromptFile>("duplicate_file", { path }),

  // Batch move
  moveFiles: (paths: string[], destination: string) =>
    call<{ ok: boolean }>("move_files", { paths, destination }),

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
  updateConfig: (updates: Partial<RepoConfig>) =>
    call<RepoConfig>("update_config", { updates }),

  // Debounced commit helpers
  generateCommitMessage: (path: string) =>
    call<string>("generate_commit_message", { path }),
  commitFile: (path: string, message: string) =>
    call<{ ok: boolean }>("commit_file", { path, message }),
};
