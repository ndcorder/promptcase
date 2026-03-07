import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  unlink,
  rename,
  access,
} from "node:fs/promises";
import { join, resolve, relative, dirname, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { parsePromptFile, serializePromptFile } from "./frontmatter.ts";
import type { PromptFile, PromptEntry, PromptFrontmatter, RepoConfig } from "./types.ts";
import { GitOps } from "./git-ops.ts";

export class FileOps {
  private repoRoot: string;
  private git: GitOps;
  private config: RepoConfig;

  constructor(repoRoot: string, config: RepoConfig, git: GitOps) {
    this.repoRoot = repoRoot;
    this.config = config;
    this.git = git;
  }

  private safePath(filePath: string): string {
    const resolved = resolve(this.repoRoot, filePath);
    if (!resolved.startsWith(this.repoRoot)) {
      throw new Error(`Path traversal denied: ${filePath}`);
    }
    return resolved;
  }

  async listAll(): Promise<PromptEntry[]> {
    const entries: PromptEntry[] = [];
    await this.walkDir(this.repoRoot, entries);
    return entries;
  }

  private async walkDir(dir: string, entries: PromptEntry[]): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".") || item.name === "node_modules") continue;
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        await this.walkDir(fullPath, entries);
      } else if (item.isFile() && extname(item.name) === ".md") {
        try {
          const content = await readFile(fullPath, "utf-8");
          const relPath = relative(this.repoRoot, fullPath);
          const parsed = parsePromptFile(relPath, content);
          entries.push({ path: relPath, frontmatter: parsed.frontmatter });
        } catch (e) {
          console.error("failed to parse prompt file:", fullPath, e);
        }
      }
    }
  }

  async read(filePath: string): Promise<PromptFile> {
    const fullPath = this.safePath(filePath);
    const content = await readFile(fullPath, "utf-8");
    return parsePromptFile(filePath, content);
  }

  async write(
    filePath: string,
    frontmatter: PromptFrontmatter,
    body: string,
  ): Promise<void> {
    const fullPath = this.safePath(filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    const content = serializePromptFile(frontmatter, body);
    await writeFile(fullPath, content, "utf-8");

    if (this.config.auto_commit) {
      await this.git.autoCommit([filePath], "Update", frontmatter.title);
    }
  }

  async readRaw(filePath: string): Promise<string> {
    const fullPath = this.safePath(filePath);
    return readFile(fullPath, "utf-8");
  }

  async writeRaw(filePath: string, content: string): Promise<void> {
    const fullPath = this.safePath(filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }

  async create(
    filePath: string,
    title: string,
    type: "prompt" | "fragment" = "prompt",
    template?: string,
  ): Promise<PromptFile> {
    const fullPath = this.safePath(filePath);
    await mkdir(dirname(fullPath), { recursive: true });

    let content: string;
    if (template) {
      try {
        const tplPath = this.safePath(join("_templates", template + ".md"));
        content = await readFile(tplPath, "utf-8");
      } catch (e) {
        console.error("failed to load template:", template, e);
        content = this.defaultTemplate(title, type);
      }
    } else {
      content = this.defaultTemplate(title, type);
    }

    await writeFile(fullPath, content, "utf-8");

    if (this.config.auto_commit) {
      await this.git.autoCommit([filePath], "Create", title);
    }

    return parsePromptFile(filePath, content);
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.safePath(filePath);
    const parsed = await this.read(filePath);
    await unlink(fullPath);

    if (this.config.auto_commit) {
      await this.git.autoCommit([filePath], "Delete", parsed.frontmatter.title);
    }
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    const fromFull = this.safePath(fromPath);
    const toFull = this.safePath(toPath);
    await mkdir(dirname(toFull), { recursive: true });

    const content = await readFile(fromFull, "utf-8");
    const parsed = parsePromptFile(fromPath, content);

    await rename(fromFull, toFull);

    if (this.config.auto_commit) {
      await this.git.autoCommit(
        [fromPath, toPath],
        "Move",
        parsed.frontmatter.title,
      );
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await access(this.safePath(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async getFolders(): Promise<string[]> {
    const folders: string[] = [];
    await this.collectFolders(this.repoRoot, "", folders);
    return folders;
  }

  private async collectFolders(
    dir: string,
    relDir: string,
    folders: string[],
  ): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".") || item.name === "node_modules") continue;
      if (item.isDirectory()) {
        const relPath = relDir ? `${relDir}/${item.name}` : item.name;
        folders.push(relPath);
        await this.collectFolders(join(dir, item.name), relPath, folders);
      }
    }
  }

  async getAllTags(): Promise<string[]> {
    const entries = await this.listAll();
    const tagSet = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.frontmatter.tags) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  }

  private defaultTemplate(title: string, type: "prompt" | "fragment"): string {
    const now = new Date().toISOString();
    const id = randomUUID().split("-")[0];
    return `---
id: "${id}"
title: "${title}"
type: ${type}
tags: []
variables: []
created: ${now}
modified: ${now}
starred_versions: []
---

`;
  }
}
