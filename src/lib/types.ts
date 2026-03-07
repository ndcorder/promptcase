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

export interface LintResult {
  rule: string;
  severity: "error" | "warning" | "info";
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

export interface RepoConfig {
  version: number;
  default_model: string;
  auto_commit: boolean;
  commit_prefix: string;
  token_count_models: string[];
  lint_rules: Record<string, string>;
}

export interface RepoStatus {
  initialized: boolean;
  clean: boolean;
  totalFiles: number;
  repoPath: string;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  files: PromptEntry[];
  expanded: boolean;
}

export interface TabInfo {
  path: string;
  title: string;
  modified: boolean;
  active: boolean;
}

export type PanelPosition = "left" | "right" | "bottom";
