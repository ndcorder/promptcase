// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { api } from "../../src/lib/ipc";

/**
 * Integration tests for the mock RPC layer.
 * These exercise the full api -> rpcCall -> mockRpcCall path
 * to verify the IPC protocol contract that the sidecar must satisfy.
 */

describe("file.create", () => {
  it("creates a prompt file with correct defaults", async () => {
    const file = await api.createFile("prompts/hello.md", "Hello Prompt");
    expect(file.path).toBe("prompts/hello.md");
    expect(file.frontmatter.title).toBe("Hello Prompt");
    expect(file.frontmatter.type).toBe("prompt");
    expect(file.frontmatter.tags).toEqual([]);
    expect(file.frontmatter.id).toBeTruthy();
    expect(file.frontmatter.created).toBeTruthy();
    expect(file.frontmatter.modified).toBeTruthy();
    expect(file.body).toBe("\n");
    await api.deleteFile("prompts/hello.md");
  });

  it("creates a fragment file when type is specified", async () => {
    const file = await api.createFile("fragments/header.md", "Header", "fragment");
    expect(file.frontmatter.type).toBe("fragment");
    await api.deleteFile("fragments/header.md");
  });

  it("assigns unique IDs to different files", async () => {
    const a = await api.createFile("a.md", "A");
    const b = await api.createFile("b.md", "B");
    expect(a.frontmatter.id).not.toBe(b.frontmatter.id);
    await api.deleteFile("a.md");
    await api.deleteFile("b.md");
  });
});

describe("file.read", () => {
  it("returns the file that was created", async () => {
    const created = await api.createFile("read-test.md", "Read Test");
    const read = await api.readFile("read-test.md");
    expect(read.path).toBe(created.path);
    expect(read.frontmatter.title).toBe("Read Test");
    expect(read.frontmatter.id).toBe(created.frontmatter.id);
    await api.deleteFile("read-test.md");
  });

  it("returns undefined for a non-existent file", async () => {
    const result = await api.readFile("does-not-exist.md");
    expect(result).toBeUndefined();
  });
});

describe("file.write", () => {
  it("merges frontmatter fields without clobbering others", async () => {
    await api.createFile("merge-test.md", "Original Title");
    await api.writeFile("merge-test.md", { tags: ["new-tag"] });

    const updated = await api.readFile("merge-test.md");
    expect(updated.frontmatter.tags).toEqual(["new-tag"]);
    expect(updated.frontmatter.title).toBe("Original Title");
    await api.deleteFile("merge-test.md");
  });

  it("updates the body when provided", async () => {
    await api.createFile("body-test.md", "Body Test");
    await api.writeFile("body-test.md", undefined, "New body content");

    const updated = await api.readFile("body-test.md");
    expect(updated.body).toBe("New body content");
    await api.deleteFile("body-test.md");
  });

  it("updates the modified timestamp on write", async () => {
    const file = await api.createFile("ts-test.md", "Timestamp Test");
    const originalModified = file.frontmatter.modified;

    await new Promise((r) => setTimeout(r, 10));
    await api.writeFile("ts-test.md", { tags: ["updated"] });

    const updated = await api.readFile("ts-test.md");
    expect(updated.frontmatter.modified).not.toBe(originalModified);
    await api.deleteFile("ts-test.md");
  });
});

describe("file.delete", () => {
  it("removes a file so it cannot be read", async () => {
    await api.createFile("to-delete.md", "Delete Me");
    const result = await api.deleteFile("to-delete.md");
    expect(result.ok).toBe(true);
    const gone = await api.readFile("to-delete.md");
    expect(gone).toBeUndefined();
  });
});

describe("file.list", () => {
  it("reflects creates and deletes", async () => {
    const before = await api.listFiles();
    const beforeCount = before.length;

    await api.createFile("list-a.md", "List A");
    await api.createFile("list-b.md", "List B");
    const after = await api.listFiles();
    expect(after.length).toBe(beforeCount + 2);

    await api.deleteFile("list-a.md");
    await api.deleteFile("list-b.md");
  });
});

describe("file.move", () => {
  it("moves a file to a new path", async () => {
    await api.createFile("src-file.md", "Move Me");
    await api.moveFile("src-file.md", "dest-file.md");

    const old = await api.readFile("src-file.md");
    expect(old).toBeUndefined();

    const moved = await api.readFile("dest-file.md");
    expect(moved).toBeTruthy();
    expect(moved.frontmatter.title).toBe("Move Me");
    await api.deleteFile("dest-file.md");
  });
});

describe("state persistence across calls", () => {
  it("create -> write -> read returns consistent data", async () => {
    await api.createFile("persist.md", "Persist Test");
    await api.writeFile("persist.md", { tags: ["persisted"] }, "Persisted body");

    const file = await api.readFile("persist.md");
    expect(file.frontmatter.title).toBe("Persist Test");
    expect(file.frontmatter.tags).toEqual(["persisted"]);
    expect(file.body).toBe("Persisted body");
    await api.deleteFile("persist.md");
  });
});

describe("other RPC methods", () => {
  it("tokens.count returns approximate count", async () => {
    const count = await api.countTokens("Hello, world! This is a test.", "gpt-4o");
    expect(count).toBe(Math.ceil(29 / 4));
  });

  it("search returns empty array", async () => {
    const results = await api.search("anything");
    expect(results).toEqual([]);
  });

  it("git.status returns initialized status", async () => {
    const status = await api.gitStatus();
    expect(status.initialized).toBe(true);
    expect(status.clean).toBe(true);
  });

  it("config.get returns valid config shape", async () => {
    const config = await api.getConfig();
    expect(config.version).toBe(1);
    expect(config.token_count_models).toContain("gpt-4o");
    expect(typeof config.auto_commit).toBe("boolean");
  });
});
