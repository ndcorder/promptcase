import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileOps } from "../src/file-ops.ts";
import { GitOps } from "../src/git-ops.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";

let testDir: string;
let fileOps: FileOps;
let gitOps: GitOps;

const config = { ...DEFAULT_CONFIG, auto_commit: false };

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "promptcase-fileops-"));
  gitOps = new GitOps(testDir);
  await gitOps.init();
  fileOps = new FileOps(testDir, config, gitOps);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("FileOps", () => {
  it("safePath rejects path traversal", async () => {
    await expect(fileOps.read("../../etc/passwd")).rejects.toThrow(
      "Path traversal denied",
    );
  });

  it("safePath rejects absolute paths", async () => {
    await expect(fileOps.read("/etc/passwd")).rejects.toThrow();
  });

  it("readRaw returns raw content", async () => {
    const content = "hello raw content";
    await writeFile(join(testDir, "raw.md"), content, "utf-8");
    const result = await fileOps.readRaw("raw.md");
    expect(result).toBe(content);
  });

  it("readRaw rejects traversal", async () => {
    await expect(fileOps.readRaw("../outside")).rejects.toThrow(
      "Path traversal denied",
    );
  });

  it("exists returns true for existing file", async () => {
    await writeFile(join(testDir, "here.md"), "x", "utf-8");
    expect(await fileOps.exists("here.md")).toBe(true);
  });

  it("exists returns false for missing file", async () => {
    expect(await fileOps.exists("nope.md")).toBe(false);
  });

  it("getFolders lists directories", async () => {
    await mkdir(join(testDir, "a", "b"), { recursive: true });
    await mkdir(join(testDir, "c"), { recursive: true });
    const folders = await fileOps.getFolders();
    expect(folders).toContain("a");
    expect(folders).toContain("a/b");
    expect(folders).toContain("c");
  });

  it("getAllTags collects unique sorted tags", async () => {
    await writeFile(
      join(testDir, "one.md"),
      `---
id: "1"
title: "One"
type: prompt
tags: [b, a]
variables: []
created: 2024-01-01T00:00:00.000Z
modified: 2024-01-01T00:00:00.000Z
starred_versions: []
---

Body one.
`,
      "utf-8",
    );
    await writeFile(
      join(testDir, "two.md"),
      `---
id: "2"
title: "Two"
type: prompt
tags: [c, a]
variables: []
created: 2024-01-01T00:00:00.000Z
modified: 2024-01-01T00:00:00.000Z
starred_versions: []
---

Body two.
`,
      "utf-8",
    );
    const tags = await fileOps.getAllTags();
    expect(tags).toEqual(["a", "b", "c"]);
  });

  it("move renames file", async () => {
    await writeFile(
      join(testDir, "old.md"),
      `---
id: "m"
title: "Move Me"
type: prompt
tags: []
variables: []
created: 2024-01-01T00:00:00.000Z
modified: 2024-01-01T00:00:00.000Z
starred_versions: []
---

Content.
`,
      "utf-8",
    );
    await fileOps.move("old.md", "new.md");
    expect(await fileOps.exists("new.md")).toBe(true);
    expect(await fileOps.exists("old.md")).toBe(false);
  });

  it("delete removes file", async () => {
    await writeFile(
      join(testDir, "del.md"),
      `---
id: "d"
title: "Delete Me"
type: prompt
tags: []
variables: []
created: 2024-01-01T00:00:00.000Z
modified: 2024-01-01T00:00:00.000Z
starred_versions: []
---

Gone.
`,
      "utf-8",
    );
    await fileOps.delete("del.md");
    expect(await fileOps.exists("del.md")).toBe(false);
  });
});
