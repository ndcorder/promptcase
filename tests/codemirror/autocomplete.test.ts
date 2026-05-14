import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock autocompletion to capture the config object (including the override fn)
vi.mock("@codemirror/autocomplete", () => ({
  autocompletion: vi.fn((config: any) => config),
}));

import {
  updateCompletionContext,
  templateAutocompletion,
  type AutocompleteContext,
} from "../../src/lib/codemirror/autocomplete";

// templateAutocompletion is the config object returned by our mock.
// The override array holds [templateCompletions].
const templateCompletions = (templateAutocompletion as any).override[0] as (
  ctx: any,
) => any;

function mockContext(matchResult: { from: number; text: string } | null) {
  return {
    matchBefore: vi.fn().mockReturnValue(matchResult),
  };
}

describe("autocomplete", () => {
  const ctx: AutocompleteContext = {
    variables: ["name", "role"],
    fragmentPaths: ["fragments/persona.md", "fragments/rules.md"],
    tags: ["work", "personal"],
  };

  beforeEach(() => {
    updateCompletionContext(ctx);
  });

  describe("templateCompletions", () => {
    it("returns null when matchBefore finds nothing", () => {
      const result = templateCompletions(mockContext(null));
      expect(result).toBeNull();
    });

    it("returns fragment completions when text contains {{include:", () => {
      // Simulates cursor at: {{include:frag|
      const match = { from: 0, text: "{{include:frag" };
      const result = templateCompletions(mockContext(match));
      expect(result).not.toBeNull();
      // from = 0 + indexOf("{{include:") + 10 = 10
      expect(result.from).toBe(10);
      expect(result.filter).toBe(true);
      expect(result.options).toHaveLength(2);
      expect(result.options[0]).toEqual({
        label: "fragments/persona.md",
        type: "text",
        detail: "fragment",
      });
      expect(result.options[1]).toEqual({
        label: "fragments/rules.md",
        type: "text",
        detail: "fragment",
      });
    });

    it("returns variable completions when text contains {{", () => {
      // Simulates cursor at: {{na|
      const match = { from: 5, text: "{{na" };
      const result = templateCompletions(mockContext(match));
      expect(result).not.toBeNull();
      // from = 5 + lastIndexOf("{{") + 2 = 5 + 0 + 2 = 7
      expect(result.from).toBe(7);
      expect(result.filter).toBe(true);
      // 2 variables + 1 include: keyword
      expect(result.options).toHaveLength(3);
      expect(result.options[0]).toEqual({
        label: "name",
        type: "variable",
        detail: "variable",
      });
      expect(result.options[1]).toEqual({
        label: "role",
        type: "variable",
        detail: "variable",
      });
      expect(result.options[2]).toEqual({
        label: "include:",
        type: "keyword",
        detail: "include fragment",
      });
    });

    it("prioritizes {{include: over bare {{ when both present", () => {
      // The includes check comes first in the code, so {{include: wins.
      const match = { from: 0, text: "{{include:" };
      const result = templateCompletions(mockContext(match));
      expect(result).not.toBeNull();
      // Should give fragment options, not variable options
      expect(result.options[0].detail).toBe("fragment");
    });

    it("returns null when matched text has no {{ at all", () => {
      // This branch is theoretically unreachable with the regex,
      // but we test the defensive code path.
      // matchBefore returns a result but the text doesn't contain "{{".
      const match = { from: 0, text: "{something" };
      const result = templateCompletions(mockContext(match));
      expect(result).toBeNull();
    });
  });

  describe("updateCompletionContext", () => {
    it("updates context used by completions", () => {
      updateCompletionContext({
        variables: ["only_var"],
        fragmentPaths: [],
        tags: [],
      });
      const match = { from: 0, text: "{{" };
      const result = templateCompletions(mockContext(match));
      expect(result).not.toBeNull();
      // 1 variable + 1 include: keyword
      expect(result.options).toHaveLength(2);
      expect(result.options[0].label).toBe("only_var");
    });

    it("empty context yields only the include: keyword option", () => {
      updateCompletionContext({
        variables: [],
        fragmentPaths: [],
        tags: [],
      });
      const match = { from: 0, text: "{{" };
      const result = templateCompletions(mockContext(match));
      expect(result).not.toBeNull();
      expect(result.options).toHaveLength(1);
      expect(result.options[0].label).toBe("include:");
    });
  });

  describe("templateAutocompletion export", () => {
    it("was created by calling autocompletion with override array", () => {
      // Our mock makes autocompletion return its config, so
      // templateAutocompletion IS the config object.
      expect(templateAutocompletion).toHaveProperty("override");
      expect((templateAutocompletion as any).override).toHaveLength(1);
      expect(typeof (templateAutocompletion as any).override[0]).toBe("function");
    });
  });
});
