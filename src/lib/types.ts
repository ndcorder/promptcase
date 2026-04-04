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
  modelTargets?: string[];
  variables: VariableDefinition[];
  includes: string[];
  created: string;
  modified: string;
  starredVersions: StarredVersion[];
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
  defaultModel: string;
  autoCommit: boolean;
  commitPrefix: string;
  commitDelayMs?: number;
  tokenCountModels: string[];
  lintRules: Record<string, "error" | "warning" | "info">;
  editorFontFamily: string;
  editorFontSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  editorShowInvisibles: boolean;
  theme: string;
  sidebarPosition: string;
  keybindings: Record<string, string>;
  savedFilters: SavedFilter[];
}

export interface SavedFilter {
  name: string;
  tag: string;
  query: string;
  icon: string;
}

export interface TagInfo {
  name: string;
  count: number;
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

export interface CompareVersion {
  label: string;
  commit: string;
  content: string;
}

export interface CompareState {
  visible: boolean;
  path: string | null;
  versionA: CompareVersion | null;
  versionB: CompareVersion | null;
}
