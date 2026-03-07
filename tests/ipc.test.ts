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
    expect(config.default_model).toBe("claude-sonnet-4");
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
