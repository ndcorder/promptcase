import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "./yaml-minimal.ts";
import { DEFAULT_CONFIG } from "./types.ts";
import type { RepoConfig } from "./types.ts";

const CONFIG_FILE = ".promptcase.yaml";

export async function loadConfig(repoRoot: string): Promise<RepoConfig> {
  const configPath = join(repoRoot, CONFIG_FILE);
  try {
    await access(configPath);
    const content = await readFile(configPath, "utf-8");
    const parsed = parseYaml(content);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(
  repoRoot: string,
  config: RepoConfig,
): Promise<void> {
  const configPath = join(repoRoot, CONFIG_FILE);
  const content = stringifyYaml(config);
  await writeFile(configPath, content, "utf-8");
}

export async function ensureRepoStructure(repoRoot: string): Promise<void> {
  const { mkdir, writeFile: wf } = await import("node:fs/promises");

  // Create .promptcase.yaml if missing
  const configPath = join(repoRoot, CONFIG_FILE);
  try {
    await access(configPath);
  } catch {
    await saveConfig(repoRoot, DEFAULT_CONFIG);
  }

  // Create .gitignore if missing
  const gitignorePath = join(repoRoot, ".gitignore");
  try {
    await access(gitignorePath);
  } catch {
    await wf(
      gitignorePath,
      `.DS_Store
Thumbs.db
*.swp
*.swo
*~
.vscode/
.idea/
node_modules/
`,
      "utf-8",
    );
  }

  // Create _templates/ with default templates
  const templatesDir = join(repoRoot, "_templates");
  await mkdir(templatesDir, { recursive: true });

  const systemTpl = join(templatesDir, "system-prompt.md");
  try {
    await access(systemTpl);
  } catch {
    await wf(
      systemTpl,
      `---
id: ""
title: ""
type: prompt
tags: []
variables: []
created: ""
modified: ""
starred_versions: []
---

You are a helpful assistant.
`,
      "utf-8",
    );
  }

  const userTpl = join(templatesDir, "user-prompt.md");
  try {
    await access(userTpl);
  } catch {
    await wf(
      userTpl,
      `---
id: ""
title: ""
type: prompt
tags: []
variables: []
created: ""
modified: ""
starred_versions: []
---

Please help me with the following task:
`,
      "utf-8",
    );
  }
}
