import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RpcHandler } from "../src/rpc.ts";

let testDir: string;
let handler: RpcHandler;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "promptcase-rpc-"));
  handler = new RpcHandler(testDir, { auto_commit: false });
  await handler.init();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function rpc(method: string, params?: unknown) {
  return handler.handle({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });
}

describe("RpcHandler", () => {
  it("responds to ping", async () => {
    const res = await rpc("ping");
    expect(res.result).toEqual({ pong: true });
  });

  it("returns config", async () => {
    const res = await rpc("config.get");
    expect((res.result as any).default_model).toBe("claude-sonnet-4");
  });

  it("creates and reads a file", async () => {
    const createRes = await rpc("file.create", {
      path: "test-prompt.md",
      title: "Test Prompt",
      type: "prompt",
    });
    expect(createRes.error).toBeUndefined();

    const readRes = await rpc("file.read", { path: "test-prompt.md" });
    expect(readRes.error).toBeUndefined();
    expect((readRes.result as any).frontmatter.title).toBe("Test Prompt");
  });

  it("lists files", async () => {
    await rpc("file.create", {
      path: "a.md",
      title: "A",
    });
    await rpc("file.create", {
      path: "b.md",
      title: "B",
    });

    const res = await rpc("file.list");
    expect((res.result as any[]).length).toBe(2);
  });

  it("deletes a file", async () => {
    await rpc("file.create", { path: "del.md", title: "Delete Me" });
    const delRes = await rpc("file.delete", { path: "del.md" });
    expect(delRes.error).toBeUndefined();

    const readRes = await rpc("file.read", { path: "del.md" });
    expect(readRes.error).toBeDefined();
  });

  it("counts tokens", async () => {
    const res = await rpc("tokens.count", {
      text: "Hello, world!",
      model: "gpt-4o",
    });
    expect(res.error).toBeUndefined();
    expect(res.result).toBeGreaterThan(0);
  });

  it("searches after creating files", async () => {
    await rpc("file.create", {
      path: "searchable.md",
      title: "Code Review Helper",
    });
    // Rebuild index
    await rpc("search.reindex");

    const res = await rpc("search.query", { q: "Code Review" });
    expect(res.error).toBeUndefined();
    expect((res.result as any[]).length).toBeGreaterThan(0);
  });

  it("lints a prompt", async () => {
    await mkdir(join(testDir, "work"), { recursive: true });
    await writeFile(
      join(testDir, "work/bad.md"),
      `---
type: prompt
---

Hello {{undefined_var}}.
`,
    );

    const res = await rpc("template.lint", { path: "work/bad.md" });
    expect(res.error).toBeUndefined();
    const results = res.result as any[];
    expect(results.some((r: any) => r.rule === "missing-title")).toBe(true);
    expect(results.some((r: any) => r.rule === "unresolved-variable")).toBe(
      true,
    );
  });

  it("returns error for unknown method", async () => {
    const res = await rpc("nonexistent.method");
    expect(res.error).toBeDefined();
    expect(res.error!.message).toContain("Unknown method");
  });

  it("resolves templates", async () => {
    await mkdir(join(testDir, "fragments"), { recursive: true });
    await writeFile(
      join(testDir, "fragments/hello.md"),
      `---
title: "Hello Fragment"
type: fragment
---

Hello from fragment!
`,
    );

    await writeFile(
      join(testDir, "main.md"),
      `---
title: "Main"
variables:
  - name: name
    default: "World"
---

Hello {{name}}.
{{include:fragments/hello}}
`,
    );

    const res = await rpc("template.resolve", { path: "main.md" });
    expect(res.error).toBeUndefined();
    const result = res.result as any;
    expect(result.text).toContain("Hello World.");
    expect(result.text).toContain("Hello from fragment!");
  });

  it("gets git status", async () => {
    const res = await rpc("git.status");
    expect(res.error).toBeUndefined();
    expect((res.result as any).initialized).toBe(true);
  });

  // --- Path traversal tests ---

  it("denies path traversal via file.read", async () => {
    const res = await rpc("file.read", { path: "../../etc/passwd" });
    expect(res.error).toBeDefined();
  });

  it("denies path traversal via file.write", async () => {
    const res = await rpc("file.write", { path: "../outside.md" });
    expect(res.error).toBeDefined();
  });

  it("denies path traversal via file.delete", async () => {
    const res = await rpc("file.delete", { path: "../../etc/hosts" });
    expect(res.error).toBeDefined();
  });

  it("denies path traversal via template.resolve", async () => {
    await writeFile(
      join(testDir, "test.md"),
      `---\ntitle: "Test"\ntype: prompt\n---\nHello.\n`,
    );
    const res = await rpc("template.resolve", {
      path: "../../../etc/passwd",
    });
    expect(res.error).toBeDefined();
  });

  it("denies path traversal via template.lint", async () => {
    const res = await rpc("template.lint", { path: "../../etc/passwd" });
    expect(res.error).toBeDefined();
  });

  // --- file.move ---

  it("file.move works", async () => {
    await rpc("file.create", { path: "from.md", title: "Move Me" });
    const moveRes = await rpc("file.move", { from: "from.md", to: "moved.md" });
    expect(moveRes.error).toBeUndefined();

    const readMoved = await rpc("file.read", { path: "moved.md" });
    expect(readMoved.error).toBeUndefined();

    const readOld = await rpc("file.read", { path: "from.md" });
    expect(readOld.error).toBeDefined();
  });

  // --- template.resolve with missing fragment ---

  it("template.resolve errors on missing fragment", async () => {
    await writeFile(
      join(testDir, "missing-frag.md"),
      `---\ntitle: "Missing Frag"\ntype: prompt\n---\n\n{{include:nonexistent/fragment}}\n`,
    );
    const res = await rpc("template.resolve", { path: "missing-frag.md" });
    expect(res.error).toBeDefined();
  });

  // --- Git argument injection tests ---

  it("rejects git argument injection via diff", async () => {
    const res = await rpc("git.diff", {
      path: "test.md",
      commitA: "--output=/tmp/pwned",
      commitB: "HEAD",
    });
    expect(res.error).toBeDefined();
  });

  it("rejects git argument injection via restore", async () => {
    const res = await rpc("git.restore", {
      path: "test.md",
      commit: "--flag-injection",
    });
    expect(res.error).toBeDefined();
  });

  // --- Concurrent RPC requests ---

  it("concurrent RPC requests maintain order", async () => {
    await rpc("file.create", { path: "c1.md", title: "C1" });
    await rpc("file.create", { path: "c2.md", title: "C2" });
    await rpc("file.create", { path: "c3.md", title: "C3" });

    const [r1, r2, r3] = await Promise.all([
      rpc("file.read", { path: "c1.md" }),
      rpc("file.read", { path: "c2.md" }),
      rpc("file.read", { path: "c3.md" }),
    ]);

    expect(r1.error).toBeUndefined();
    expect(r2.error).toBeUndefined();
    expect(r3.error).toBeUndefined();
  });
});
