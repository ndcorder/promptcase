export interface VariableDefinition {
  name: string;
  description?: string;
  default?: string;
  enum?: string[];
}

export interface StarredVersion {
  commit: string;
  label: string;
  date: string;
}

export interface PromptFrontmatter {
  id: string;
  title: string;
  type: "prompt" | "fragment";
  tags: string[];
  folder: string;
  model_targets?: string[];
  variables: VariableDefinition[];
  includes: string[];
  created: string;
  modified: string;
  starred_versions: StarredVersion[];
}

export interface PromptFile {
  path: string;
  frontmatter: PromptFrontmatter;
  body: string;
  raw: string;
}

export interface PromptEntry {
  path: string;
  frontmatter: PromptFrontmatter;
}

export interface CommitEntry {
  hash: string;
  date: string;
  message: string;
  additions: number;
  deletions: number;
}

export interface DiffResult {
  raw: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

export interface ResolvedPrompt {
  text: string;
  variables: Record<string, string>;
  unresolvedVariables: string[];
  includedFragments: string[];
}

export type LintSeverity = "error" | "warning" | "info";

export interface LintResult {
  rule: string;
  severity: LintSeverity;
  message: string;
  line?: number;
  column?: number;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
  tags: string[];
}

export interface SearchFilters {
  tag?: string;
  folder?: string;
  type?: "prompt" | "fragment";
  model?: string;
}

export interface RepoConfig {
  version: number;
  default_model: string;
  auto_commit: boolean;
  commit_prefix: string;
  token_count_models: string[];
  lint_rules: Record<string, LintSeverity>;
}

export interface RepoStatus {
  initialized: boolean;
  clean: boolean;
  totalFiles: number;
  repoPath: string;
}

export interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export const DEFAULT_CONFIG: RepoConfig = {
  version: 1,
  default_model: "claude-sonnet-4",
  auto_commit: true,
  commit_prefix: "[promptcase]",
  token_count_models: ["claude-sonnet-4", "gpt-4o"],
  lint_rules: {
    "unresolved-variable": "error",
    "unused-variable": "warning",
    "broken-include": "error",
    "circular-include": "error",
    "include-depth": "error",
    "duplicate-variable": "warning",
    "missing-description": "info",
    "missing-title": "warning",
    "empty-body": "warning",
    "orphaned-fragment": "info",
  },
};
