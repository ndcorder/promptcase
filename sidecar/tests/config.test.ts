import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, saveConfig, ensureRepoStructure } from "../src/config.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";
import { parse, stringify } from "../src/yaml-minimal.ts";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "promptcase-config-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("yaml-minimal", () => {
  it("parses simple key-value pairs", () => {
    const input = `version: 1
auto_commit: true
commit_prefix: "[promptcase]"
default_model: "claude-sonnet-4"`;

    const result = parse(input);
    expect(result.version).toBe(1);
    expect(result.auto_commit).toBe(true);
    expect(result.commit_prefix).toBe("[promptcase]");
    expect(result.default_model).toBe("claude-sonnet-4");
  });

  it("parses arrays", () => {
    const input = `token_count_models:
  - "claude-sonnet-4"
  - "gpt-4o"`;

    const result = parse(input);
    expect(result.token_count_models).toEqual(["claude-sonnet-4", "gpt-4o"]);
  });

  it("round-trips config", () => {
    const config = {
      version: 1,
      default_model: "claude-sonnet-4",
      auto_commit: true,
    };

    const yaml = stringify(config);
    const parsed = parse(yaml);
    expect(parsed.version).toBe(1);
    expect(parsed.default_model).toBe("claude-sonnet-4");
    expect(parsed.auto_commit).toBe(true);
  });

  it("parses nested objects", () => {
    const input = `lint_rules:
  missing_id: error
  empty_content: warning
  missing_title: info`;

    const result = parse(input);
    expect(result.lint_rules).toEqual({
      missing_id: "error",
      empty_content: "warning",
      missing_title: "info",
    });
  });

  it("round-trips nested objects", () => {
    const config = {
      version: 1,
      lint_rules: { missing_id: "error", empty_content: "warning" },
    };

    const yaml = stringify(config);
    const parsed = parse(yaml);
    expect(parsed.lint_rules).toEqual({
      missing_id: "error",
      empty_content: "warning",
    });
  });

  it("serializes strings with double quotes using single quotes", () => {
    const yaml = stringify({ msg: 'he said "hello"' });
    const result = parse(yaml);
    expect(result.msg).toBe('he said "hello"');
  });

  it("serializes strings with single quotes using double quotes", () => {
    const yaml = stringify({ msg: "it's fine" });
    const result = parse(yaml);
    expect(result.msg).toBe("it's fine");
  });

  it("serializes strings with both quote types", () => {
    const yaml = stringify({ msg: "he said \"it's ok\"" });
    const result = parse(yaml);
    expect(result.msg).toBe("he said \"it's ok\"");
  });

  it("distinguishes arrays from objects by peeking", () => {
    const input = `tags:
  - alpha
  - beta
rules:
  a: one
  b: two`;

    const result = parse(input);
    expect(result.tags).toEqual(["alpha", "beta"]);
    expect(result.rules).toEqual({ a: "one", b: "two" });
  });
});

describe("loadConfig", () => {
  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(testDir);
    expect(config.version).toBe(DEFAULT_CONFIG.version);
    expect(config.default_model).toBe(DEFAULT_CONFIG.default_model);
  });

  it("loads config from file", async () => {
    await saveConfig(testDir, {
      ...DEFAULT_CONFIG,
      default_model: "gpt-4o",
    });

    const config = await loadConfig(testDir);
    expect(config.default_model).toBe("gpt-4o");
  });
});

describe("ensureRepoStructure", () => {
  it("creates .promptcase.yaml", async () => {
    await ensureRepoStructure(testDir);
    const content = await readFile(
      join(testDir, ".promptcase.yaml"),
      "utf-8",
    );
    expect(content).toContain("version");
  });

  it("creates .gitignore", async () => {
    await ensureRepoStructure(testDir);
    const content = await readFile(join(testDir, ".gitignore"), "utf-8");
    expect(content).toContain(".DS_Store");
  });

  it("creates _templates directory with templates", async () => {
    await ensureRepoStructure(testDir);
    const sysPrompt = await readFile(
      join(testDir, "_templates/system-prompt.md"),
      "utf-8",
    );
    expect(sysPrompt).toContain("title:");
    const userPrompt = await readFile(
      join(testDir, "_templates/user-prompt.md"),
      "utf-8",
    );
    expect(userPrompt).toContain("title:");
  });

  it("does not overwrite existing files", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(testDir, ".promptcase.yaml"),
      "custom: true\n",
      "utf-8",
    );

    await ensureRepoStructure(testDir);
    const content = await readFile(
      join(testDir, ".promptcase.yaml"),
      "utf-8",
    );
    expect(content).toBe("custom: true\n");
  });
});
