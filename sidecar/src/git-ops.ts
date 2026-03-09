import simpleGit, { type SimpleGit } from "simple-git";
import type { CommitEntry, DiffResult, DiffHunk, RepoStatus } from "./types.ts";

function validateCommitRef(ref: string): string {
  if (!/^[0-9a-fA-F]{4,40}$|^HEAD(~\d+)?$|^[a-zA-Z0-9._\/-]+$/.test(ref)) {
    throw new Error(`Invalid commit reference: ${ref}`);
  }
  if (ref.startsWith("-") || ref.includes("..")) {
    throw new Error(`Invalid commit reference: ${ref}`);
  }
  return ref;
}

function validateFilePath(filePath: string): string {
  if (filePath.startsWith("-") || filePath.includes("..")) {
    throw new Error(`Invalid file path: ${filePath}`);
  }
  return filePath;
}

export class GitOps {
  private git: SimpleGit;
  private repoPath: string;
  private commitPrefix: string;

  constructor(repoPath: string, commitPrefix = "[promptcase]") {
    this.repoPath = repoPath;
    this.commitPrefix = commitPrefix;
    this.git = simpleGit(repoPath);
  }

  async init(): Promise<void> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      await this.git.init();
      await this.git.addConfig("user.name", "Promptcase");
      await this.git.addConfig("user.email", "promptcase@local");
    }
  }

  async isRepo(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  async status(): Promise<RepoStatus> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      return {
        initialized: false,
        clean: true,
        totalFiles: 0,
        repoPath: this.repoPath,
      };
    }
    const st = await this.git.status();
    return {
      initialized: true,
      clean: st.isClean(),
      totalFiles: st.files.length,
      repoPath: this.repoPath,
    };
  }

  async autoCommit(
    filePaths: string[],
    action: string,
    title?: string,
  ): Promise<string | null> {
    try {
      await this.git.add(filePaths);
      const st = await this.git.status();
      if (st.staged.length === 0) return null;

      const msg = title
        ? `${this.commitPrefix} ${action} "${title}"`
        : `${this.commitPrefix} ${action}`;
      const result = await this.git.commit(msg);
      return result.commit || null;
    } catch (e) {
      console.error("autoCommit failed:", e);
      return null;
    }
  }

  async log(
    filePath?: string,
    limit = 50,
  ): Promise<CommitEntry[]> {
    try {
      const log = filePath
        ? await this.git.log({ maxCount: limit, file: filePath })
        : await this.git.log({ maxCount: limit });

      return log.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        additions: 0,
        deletions: 0,
      }));
    } catch (e) {
      console.error("git log failed:", e);
      return [];
    }
  }

  async diff(
    filePath: string,
    commitA: string,
    commitB: string,
  ): Promise<DiffResult> {
    validateCommitRef(commitA);
    validateCommitRef(commitB);
    validateFilePath(filePath);
    const raw = await this.git.diff([commitA, commitB, "--", filePath]);
    return parseDiff(raw);
  }

  async diffWorkingCopy(filePath: string): Promise<DiffResult> {
    const raw = await this.git.diff(["--", filePath]);
    return parseDiff(raw);
  }

  async showFileAtCommit(filePath: string, commit: string): Promise<string> {
    validateCommitRef(commit);
    validateFilePath(filePath);
    try {
      return await this.git.show(`${commit}:${filePath}`);
    } catch (e) {
      console.error("showFileAtCommit failed:", e);
      return "";
    }
  }

  async restore(filePath: string, commit: string): Promise<string | null> {
    const content = await this.showFileAtCommit(filePath, commit);
    if (!content) return null;

    const { writeFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    if (filePath.includes("..")) {
      throw new Error(`Path traversal denied: ${filePath}`);
    }
    const fullPath = resolve(this.repoPath, filePath);
    if (!fullPath.startsWith(this.repoPath + "/")) {
      throw new Error(`Path traversal denied: ${filePath}`);
    }
    await writeFile(fullPath, content, "utf-8");

    return this.autoCommit(
      [filePath],
      "Restore",
      `restored to ${commit.slice(0, 7)}`,
    );
  }

  async addAll(): Promise<void> {
    await this.git.add(".");
  }
}

function parseDiff(raw: string): DiffResult {
  const hunks: DiffHunk[] = [];
  const hunkHeaderPattern = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;
  const lines = raw.split("\n");

  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    const hunkMatch = hunkHeaderPattern.exec(line);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: parseInt(hunkMatch[2] || "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newLines: parseInt(hunkMatch[4] || "1", 10),
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "remove", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({ type: "context", content: line.slice(1) });
    }
  }

  return { raw, hunks };
}
