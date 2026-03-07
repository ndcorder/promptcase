import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintPrompt, lintAll } from "../src/linter.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";
import type { RepoConfig } from "../src/types.ts";

let testDir: string;
const config: RepoConfig = { ...DEFAULT_CONFIG };

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "promptcase-lint-"));
  await mkdir(join(testDir, "fragments"), { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("lintPrompt", () => {
  it("reports missing title", async () => {
    const content = `---
type: prompt
tags: []
---

Some content.
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    expect(results.some((r) => r.rule === "missing-title")).toBe(true);
  });

  it("reports empty body", async () => {
    const content = `---
title: "Test"
type: prompt
---

`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    expect(results.some((r) => r.rule === "empty-body")).toBe(true);
  });

  it("reports unresolved variables", async () => {
    const content = `---
title: "Test"
variables: []
---

Hello {{name}}, how is {{weather}}?
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    const unresolvedResults = results.filter(
      (r) => r.rule === "unresolved-variable",
    );
    expect(unresolvedResults).toHaveLength(2);
    expect(unresolvedResults[0].message).toContain("name");
    expect(unresolvedResults[1].message).toContain("weather");
  });

  it("reports unused variables", async () => {
    const content = `---
title: "Test"
variables:
  - name: unused_var
    description: "Not used"
---

No variables used here.
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    expect(results.some((r) => r.rule === "unused-variable")).toBe(true);
  });

  it("reports missing variable description", async () => {
    const content = `---
title: "Test"
variables:
  - name: lang
---

Hello {{lang}}.
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    expect(results.some((r) => r.rule === "missing-description")).toBe(true);
  });

  it("reports broken includes", async () => {
    const content = `---
title: "Test"
---

{{include:fragments/nonexistent}}
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    expect(results.some((r) => r.rule === "broken-include")).toBe(true);
  });

  it("does not report errors for valid prompts", async () => {
    await writeFile(
      join(testDir, "fragments/greeting.md"),
      `---
title: "Greeting"
type: fragment
variables: []
---

Hello!
`,
    );

    const content = `---
title: "Valid Prompt"
variables:
  - name: name
    description: "User name"
---

Hello {{name}}.
{{include:fragments/greeting}}
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    const errors = results.filter((r) => r.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("reports circular includes", async () => {
    await writeFile(
      join(testDir, "fragments/self.md"),
      `---
title: "Self"
type: fragment
---

{{include:fragments/self}}
`,
    );

    const content = `---
title: "Test"
---

{{include:fragments/self}}
`;
    const results = await lintPrompt("test.md", content, {
      repoRoot: testDir,
      config,
    });

    expect(results.some((r) => r.rule === "circular-include")).toBe(true);
  });
});

describe("lintAll", () => {
  it("detects orphaned fragments", async () => {
    const prompt = `---
title: "Main"
type: prompt
---

No includes here.
`;
    const fragment = `---
title: "Orphaned"
type: fragment
---

I am never included.
`;
    const results = await lintAll(
      [
        { path: "main.md", content: prompt },
        { path: "fragments/orphaned.md", content: fragment },
      ],
      { repoRoot: testDir, config },
    );

    const orphanedResults = results["fragments/orphaned.md"]?.filter(
      (r) => r.rule === "orphaned-fragment",
    );
    expect(orphanedResults?.length).toBeGreaterThan(0);
  });
});
