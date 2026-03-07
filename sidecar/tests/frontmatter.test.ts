import { describe, it, expect } from "vitest";
import {
  parsePromptFile,
  serializePromptFile,
  updateFrontmatter,
} from "../src/frontmatter.ts";

describe("parsePromptFile", () => {
  it("parses a complete prompt file", () => {
    const content = `---
id: "abc123"
title: "Test Prompt"
type: prompt
tags: [test, demo]
variables:
  - name: language
    description: "Programming language"
    default: "Python"
model_targets: [claude-sonnet-4]
created: "2026-03-07T14:00:00Z"
modified: "2026-03-07T14:00:00Z"
starred_versions: []
---

You are a {{language}} developer.
`;

    const result = parsePromptFile("work/test.md", content);
    expect(result.frontmatter.id).toBe("abc123");
    expect(result.frontmatter.title).toBe("Test Prompt");
    expect(result.frontmatter.type).toBe("prompt");
    expect(result.frontmatter.tags).toEqual(["test", "demo"]);
    expect(result.frontmatter.variables).toHaveLength(1);
    expect(result.frontmatter.variables[0].name).toBe("language");
    expect(result.frontmatter.variables[0].default).toBe("Python");
    expect(result.body).toContain("{{language}}");
  });

  it("generates defaults for missing fields", () => {
    const content = `---
title: "Minimal"
---

Hello world.
`;
    const result = parsePromptFile("test.md", content);
    expect(result.frontmatter.id).toBeTruthy();
    expect(result.frontmatter.type).toBe("prompt");
    expect(result.frontmatter.tags).toEqual([]);
    expect(result.frontmatter.variables).toEqual([]);
    expect(result.frontmatter.starred_versions).toEqual([]);
  });

  it("extracts include paths from body", () => {
    const content = `---
title: "With Includes"
---

{{include:fragments/persona}}
Some text
{{include:fragments/format}}
`;
    const result = parsePromptFile("test.md", content);
    expect(result.frontmatter.includes).toEqual([
      "fragments/persona",
      "fragments/format",
    ]);
  });

  it("handles file with no frontmatter gracefully", () => {
    const content = "Just plain text content.";
    const result = parsePromptFile("plain.md", content);
    expect(result.frontmatter.title).toBe("");
    expect(result.body).toContain("Just plain text content.");
  });

  it("derives folder from file path", () => {
    const content = `---
title: "Nested"
---

Content.
`;
    const result = parsePromptFile("work/redrock/test.md", content);
    expect(result.frontmatter.folder).toBe("/work/redrock");
  });
});

describe("serializePromptFile", () => {
  it("round-trips a prompt file", () => {
    const original = `---
id: "abc123"
title: "Test"
type: prompt
tags:
  - test
created: "2026-03-07T14:00:00Z"
modified: "2026-03-07T14:00:00Z"
starred_versions: []
---

Body content here.
`;
    const parsed = parsePromptFile("test.md", original);
    const serialized = serializePromptFile(parsed.frontmatter, parsed.body);
    const reparsed = parsePromptFile("test.md", serialized);

    expect(reparsed.frontmatter.id).toBe("abc123");
    expect(reparsed.frontmatter.title).toBe("Test");
    expect(reparsed.body).toContain("Body content here.");
  });

  it("includes variables when present", () => {
    const fm = {
      id: "test1",
      title: "Test",
      type: "prompt" as const,
      tags: [],
      folder: "/",
      variables: [{ name: "lang", default: "Python" }],
      includes: [],
      created: "2026-03-07T14:00:00Z",
      modified: "2026-03-07T14:00:00Z",
      starred_versions: [],
    };

    const result = serializePromptFile(fm, "\nHello {{lang}}\n");
    expect(result).toContain("variables:");
    expect(result).toContain("lang");
  });
});

describe("updateFrontmatter", () => {
  it("updates specific frontmatter fields", () => {
    const content = `---
id: "abc123"
title: "Old Title"
tags: [old]
---

Body.
`;
    const updated = updateFrontmatter(content, {
      title: "New Title",
      tags: ["new", "updated"],
    } as any);
    const parsed = parsePromptFile("test.md", updated);
    expect(parsed.frontmatter.title).toBe("New Title");
    expect(parsed.frontmatter.tags).toEqual(["new", "updated"]);
    expect(parsed.body).toContain("Body.");
  });
});
