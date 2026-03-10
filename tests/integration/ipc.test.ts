// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { api } from "../../src/lib/ipc";

/**
 * Integration tests for the IPC layer.
 * These exercise the full api -> call -> mockCall path
 * to verify the IPC protocol contract that the Rust backend must satisfy.
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
    expect(config.tokenCountModels).toContain("gpt-4o");
    expect(typeof config.autoCommit).toBe("boolean");
  });
});

// === New tests below ===

describe("file edge cases", () => {
  it("readFile returns undefined for nonexistent path", async () => {
    const result = await api.readFile("nonexistent/path/file.md");
    expect(result).toBeUndefined();
  });

  it("writeFile to nonexistent file returns ok (no-op in mock)", async () => {
    const result = await api.writeFile("does-not-exist.md", { tags: ["x"] });
    expect(result.ok).toBe(true);
  });

  it("deleteFile for nonexistent file returns ok", async () => {
    const result = await api.deleteFile("never-created.md");
    expect(result.ok).toBe(true);
  });

  it("moveFile preserves frontmatter", async () => {
    await api.createFile("move-fm.md", "FM Test");
    await api.writeFile("move-fm.md", { tags: ["keep-me"] }, "Body kept");
    await api.moveFile("move-fm.md", "moved-fm.md");

    const moved = await api.readFile("moved-fm.md");
    expect(moved).toBeTruthy();
    expect(moved.frontmatter.title).toBe("FM Test");
    expect(moved.frontmatter.tags).toEqual(["keep-me"]);
    expect(moved.body).toBe("Body kept");
    await api.deleteFile("moved-fm.md");
  });

  it("createFile with fragment type", async () => {
    const file = await api.createFile("frag.md", "My Fragment", "fragment");
    expect(file.frontmatter.type).toBe("fragment");
    expect(file.frontmatter.title).toBe("My Fragment");
    expect(file.frontmatter.tags).toEqual([]);
    await api.deleteFile("frag.md");
  });

  it("listFiles returns empty when no files exist", async () => {
    // Delete all files first
    const files = await api.listFiles();
    for (const f of files) {
      await api.deleteFile(f.path);
    }
    const empty = await api.listFiles();
    expect(empty).toEqual([]);
  });
});

describe("git operations", () => {
  it("gitLog always returns empty array in mock", async () => {
    const log = await api.gitLog("any-file.md", 10);
    expect(log).toEqual([]);
  });

  it("gitStatus returns initialized=true", async () => {
    const status = await api.gitStatus();
    expect(status.initialized).toBe(true);
    expect(status.repoPath).toBe("~/prompts");
  });

  it("gitRestore returns null in mock", async () => {
    const result = await api.gitRestore("some-file.md", "abc123");
    expect(result).toBeNull();
  });

  it("gitDiff returns empty hunks", async () => {
    const diff = await api.gitDiff("file.md", "aaa", "bbb");
    expect(diff.hunks).toEqual([]);
  });
});

describe("template operations", () => {
  it("resolveTemplate returns file body for existing file", async () => {
    await api.createFile("resolve-test.md", "Resolve");
    await api.writeFile("resolve-test.md", undefined, "Hello {{name}}");

    const resolved = await api.resolveTemplate("resolve-test.md", { name: "World" });
    expect(resolved.text).toBe("Hello {{name}}");
    expect(resolved.variables).toEqual({});
    expect(resolved.unresolvedVariables).toEqual([]);
    expect(resolved.includedFragments).toEqual([]);
    await api.deleteFile("resolve-test.md");
  });

  it("lintFile returns empty array in mock", async () => {
    const result = await api.lintFile("any-file.md");
    expect(result).toEqual([]);
  });

  it("lintAll returns empty object in mock", async () => {
    const result = await api.lintAll();
    expect(result).toEqual({});
  });

  it("getVariables returns empty array in mock", async () => {
    const result = await api.getVariables("any-file.md");
    expect(result).toEqual([]);
  });
});

describe("search operations", () => {
  it("search returns empty array", async () => {
    const results = await api.search("nonexistent query");
    expect(results).toEqual([]);
  });

  it("reindex returns ok", async () => {
    const result = await api.reindex();
    expect(result.ok).toBe(true);
  });
});

describe("config", () => {
  it("getConfig returns all expected fields", async () => {
    const config = await api.getConfig();
    expect(config).toHaveProperty("version");
    expect(config).toHaveProperty("defaultModel");
    expect(config).toHaveProperty("autoCommit");
    expect(config).toHaveProperty("commitPrefix");
    expect(config).toHaveProperty("tokenCountModels");
    expect(config).toHaveProperty("lintRules");
  });

  it("getConfig has correct default values", async () => {
    const config = await api.getConfig();
    expect(config.version).toBe(1);
    expect(config.defaultModel).toBe("claude-sonnet-4");
    expect(config.autoCommit).toBe(true);
    expect(config.commitPrefix).toBe("[promptcase]");
    expect(config.tokenCountModels).toEqual(["claude-sonnet-4", "gpt-4o"]);
    expect(config.lintRules).toEqual({});
  });

  it("getConfig has camelCase field names", async () => {
    const config = await api.getConfig();
    expect(config.defaultModel).toBeDefined();
    expect(config.autoCommit).toBeDefined();
    expect(config.commitPrefix).toBeDefined();
    expect(config.tokenCountModels).toBeDefined();
    expect(config.lintRules).toBeDefined();
  });
});

describe("token counting edge cases", () => {
  it("countTokens for empty string returns 0", async () => {
    const count = await api.countTokens("", "gpt-4o");
    expect(count).toBe(0);
  });

  it("countTokensResolved uses file body length", async () => {
    await api.createFile("token-test.md", "Token Test");
    await api.writeFile("token-test.md", undefined, "1234567890123456"); // 16 chars => ceil(16/4) = 4

    const count = await api.countTokensResolved("token-test.md", "gpt-4o");
    expect(count).toBe(4);
    await api.deleteFile("token-test.md");
  });

  it("countTokensResolved for nonexistent file returns 0", async () => {
    const count = await api.countTokensResolved("no-such-file.md", "gpt-4o");
    expect(count).toBe(0);
  });
});
