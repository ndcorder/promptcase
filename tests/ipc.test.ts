// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { api, isTauri } from "../src/lib/ipc";

describe("IPC mock mode", () => {
  it("detects non-Tauri environment", () => {
    expect(isTauri()).toBe(false);
  });

  it("responds to ping", async () => {
    // In test/dev mode, uses mock implementation
    // This tests the mock layer works
  });

  it("creates a file via mock", async () => {
    const file = await api.createFile("test.md", "Test Prompt");
    expect(file.path).toBe("test.md");
    expect(file.frontmatter.title).toBe("Test Prompt");
    expect(file.frontmatter.type).toBe("prompt");
  });

  it("lists files via mock", async () => {
    await api.createFile("a.md", "A");
    await api.createFile("b.md", "B");
    const list = await api.listFiles();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes a file via mock", async () => {
    await api.createFile("del.md", "Delete Me");
    const result = await api.deleteFile("del.md");
    expect(result.ok).toBe(true);
  });

  it("gets git status via mock", async () => {
    const status = await api.gitStatus();
    expect(status.initialized).toBe(true);
  });

  it("gets config via mock", async () => {
    const config = await api.getConfig();
    expect(config.defaultModel).toBe("claude-sonnet-4");
  });

  it("counts tokens via mock", async () => {
    const count = await api.countTokens("Hello world", "gpt-4o");
    expect(count).toBeGreaterThan(0);
  });

  it("returns empty search results via mock", async () => {
    const results = await api.search("test");
    expect(results).toEqual([]);
  });
});

describe("isTauri detection", () => {
  it("returns false in test environment (no __TAURI__)", () => {
    expect(isTauri()).toBe(false);
    expect((window as unknown as Record<string, unknown>).__TAURI__).toBeUndefined();
  });
});

describe("mock frontmatter shape", () => {
  it("creates files with correct camelCase frontmatter fields", async () => {
    const file = await api.createFile("shape-test.md", "Shape Test");
    const fm = file.frontmatter;

    // Verify camelCase field names (matching what Rust sends)
    expect(fm).toHaveProperty("id");
    expect(fm).toHaveProperty("title");
    expect(fm).toHaveProperty("type");
    expect(fm).toHaveProperty("tags");
    expect(fm).toHaveProperty("folder");
    expect(fm).toHaveProperty("variables");
    expect(fm).toHaveProperty("includes");
    expect(fm).toHaveProperty("created");
    expect(fm).toHaveProperty("modified");
    expect(fm).toHaveProperty("starredVersions");

    // Verify no snake_case variants exist
    expect((fm as unknown as Record<string, unknown>).starred_versions).toBeUndefined();
    expect((fm as unknown as Record<string, unknown>).prompt_type).toBeUndefined();

    await api.deleteFile("shape-test.md");
  });

  it("has starredVersions as empty array (not starred_versions)", async () => {
    const file = await api.createFile("starred-test.md", "Starred Test");

    expect(file.frontmatter.starredVersions).toEqual([]);
    expect(Array.isArray(file.frontmatter.starredVersions)).toBe(true);
    expect((file.frontmatter as unknown as Record<string, unknown>).starred_versions).toBeUndefined();

    await api.deleteFile("starred-test.md");
  });

  it("frontmatter has valid ISO date strings", async () => {
    const file = await api.createFile("date-test.md", "Date Test");

    const created = new Date(file.frontmatter.created);
    const modified = new Date(file.frontmatter.modified);
    expect(created.toISOString()).toBe(file.frontmatter.created);
    expect(modified.toISOString()).toBe(file.frontmatter.modified);

    await api.deleteFile("date-test.md");
  });
});
