import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitOps } from "../src/git-ops.ts";

let testDir: string;
let gitOps: GitOps;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "promptcase-gitops-"));
  gitOps = new GitOps(testDir);
  await gitOps.init();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("GitOps", () => {
  it("init creates a git repo", async () => {
    expect(await gitOps.isRepo()).toBe(true);
  });

  it("status on fresh repo", async () => {
    const st = await gitOps.status();
    expect(st.initialized).toBe(true);
    expect(st.clean).toBe(true);
  });

  it("autoCommit returns null when nothing staged", async () => {
    const result = await gitOps.autoCommit(["nonexistent"], "Test");
    expect(result).toBeNull();
  });

  it("log returns empty on fresh repo", async () => {
    const entries = await gitOps.log();
    expect(entries).toEqual([]);
  });

  it("diff rejects flag injection in commitA", async () => {
    await expect(
      gitOps.diff("file.md", "--flag", "HEAD"),
    ).rejects.toThrow("Invalid commit reference");
  });

  it("diff rejects flag injection in commitB", async () => {
    await expect(
      gitOps.diff("file.md", "HEAD", "--output=/tmp/x"),
    ).rejects.toThrow("Invalid commit reference");
  });

  it("showFileAtCommit rejects flag injection", async () => {
    await expect(
      gitOps.showFileAtCommit("file.md", "--flag"),
    ).rejects.toThrow("Invalid commit reference");
  });

  it("diff rejects dash-prefixed filePath", async () => {
    await expect(
      gitOps.diff("-file.md", "abc123", "def456"),
    ).rejects.toThrow("Invalid file path");
  });

  it("showFileAtCommit accepts valid hex hash", async () => {
    // Should not throw — may return empty string since commit doesn't exist
    const result = await gitOps.showFileAtCommit("file.md", "abc1234");
    expect(typeof result).toBe("string");
  });

  it("showFileAtCommit accepts HEAD ref", async () => {
    const result = await gitOps.showFileAtCommit("file.md", "HEAD");
    expect(typeof result).toBe("string");
  });
});
