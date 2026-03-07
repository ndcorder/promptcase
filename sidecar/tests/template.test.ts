import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveTemplate, extractVariableNames, extractIncludePaths } from "../src/template.ts";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "promptcase-test-"));
  await mkdir(join(testDir, "fragments"), { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("extractVariableNames", () => {
  it("extracts simple variable names", () => {
    const body = "Hello {{name}}, you are a {{role}} developer.";
    expect(extractVariableNames(body)).toEqual(["name", "role"]);
  });

  it("ignores include directives", () => {
    const body = "{{include:fragments/test}} and {{name}}";
    expect(extractVariableNames(body)).toEqual(["name"]);
  });

  it("deduplicates variable names", () => {
    const body = "{{name}} and {{name}} again";
    expect(extractVariableNames(body)).toEqual(["name"]);
  });

  it("returns empty for no variables", () => {
    expect(extractVariableNames("No variables here.")).toEqual([]);
  });
});

describe("extractIncludePaths", () => {
  it("extracts include paths", () => {
    const body = "{{include:fragments/a}} text {{include:fragments/b}}";
    expect(extractIncludePaths(body)).toEqual(["fragments/a", "fragments/b"]);
  });

  it("deduplicates paths", () => {
    const body = "{{include:fragments/a}} {{include:fragments/a}}";
    expect(extractIncludePaths(body)).toEqual(["fragments/a"]);
  });
});

describe("resolveTemplate", () => {
  it("resolves variables with provided values", async () => {
    const content = `---
title: "Test"
variables:
  - name: language
    default: "Python"
---

You are a {{language}} developer.
`;
    const result = await resolveTemplate("test.md", content, {
      repoRoot: testDir,
      variables: { language: "Rust" },
    });

    expect(result.text).toContain("You are a Rust developer.");
    expect(result.unresolvedVariables).toEqual([]);
  });

  it("uses defaults when no value provided", async () => {
    const content = `---
title: "Test"
variables:
  - name: language
    default: "Python"
---

You are a {{language}} developer.
`;
    const result = await resolveTemplate("test.md", content, {
      repoRoot: testDir,
    });

    expect(result.text).toContain("You are a Python developer.");
  });

  it("reports unresolved variables", async () => {
    const content = `---
title: "Test"
variables: []
---

Hello {{unknown_var}}.
`;
    const result = await resolveTemplate("test.md", content, {
      repoRoot: testDir,
    });

    expect(result.unresolvedVariables).toContain("unknown_var");
    expect(result.text).toContain("{{unknown_var}}");
  });

  it("resolves fragment includes", async () => {
    await writeFile(
      join(testDir, "fragments/greeting.md"),
      `---
title: "Greeting Fragment"
type: fragment
variables: []
---

Hello from the fragment!
`,
    );

    const content = `---
title: "Test"
variables: []
---

Before include.
{{include:fragments/greeting}}
After include.
`;

    const result = await resolveTemplate("test.md", content, {
      repoRoot: testDir,
    });

    expect(result.text).toContain("Hello from the fragment!");
    expect(result.text).toContain("Before include.");
    expect(result.text).toContain("After include.");
    expect(result.includedFragments).toContain("fragments/greeting");
  });

  it("resolves nested fragment includes", async () => {
    await writeFile(
      join(testDir, "fragments/inner.md"),
      `---
title: "Inner"
type: fragment
variables: []
---

Inner content.
`,
    );

    await writeFile(
      join(testDir, "fragments/outer.md"),
      `---
title: "Outer"
type: fragment
variables: []
---

Outer start.
{{include:fragments/inner}}
Outer end.
`,
    );

    const content = `---
title: "Test"
variables: []
---

Main.
{{include:fragments/outer}}
Done.
`;

    const result = await resolveTemplate("test.md", content, {
      repoRoot: testDir,
    });

    expect(result.text).toContain("Inner content.");
    expect(result.text).toContain("Outer start.");
    expect(result.includedFragments).toContain("fragments/outer");
    expect(result.includedFragments).toContain("fragments/inner");
  });

  it("detects circular includes", async () => {
    await writeFile(
      join(testDir, "fragments/a.md"),
      `---
title: "A"
type: fragment
---

A includes B: {{include:fragments/b}}
`,
    );

    await writeFile(
      join(testDir, "fragments/b.md"),
      `---
title: "B"
type: fragment
---

B includes A: {{include:fragments/a}}
`,
    );

    const content = `---
title: "Test"
---

{{include:fragments/a}}
`;

    await expect(
      resolveTemplate("test.md", content, { repoRoot: testDir }),
    ).rejects.toThrow(/[Cc]ircular/);
  });

  it("enforces max depth", async () => {
    // Create a chain of fragments 12 deep
    for (let i = 0; i < 12; i++) {
      const next = i < 11 ? `\n{{include:fragments/chain${i + 1}}}` : "\nEnd.";
      await writeFile(
        join(testDir, `fragments/chain${i}.md`),
        `---
title: "Chain ${i}"
type: fragment
---

Level ${i}.${next}
`,
      );
    }

    const content = `---
title: "Test"
---

{{include:fragments/chain0}}
`;

    await expect(
      resolveTemplate("test.md", content, {
        repoRoot: testDir,
        maxDepth: 5,
      }),
    ).rejects.toThrow(/depth/i);
  });

  it("resolves fragment variables", async () => {
    await writeFile(
      join(testDir, "fragments/persona.md"),
      `---
title: "Persona"
type: fragment
variables:
  - name: years
    default: "10"
---

You have {{years}} years of experience.
`,
    );

    const content = `---
title: "Test"
variables:
  - name: task
    default: "review"
---

Task: {{task}}
{{include:fragments/persona}}
`;

    const result = await resolveTemplate("test.md", content, {
      repoRoot: testDir,
      variables: { years: "15" },
    });

    expect(result.text).toContain("You have 15 years of experience.");
  });
});
