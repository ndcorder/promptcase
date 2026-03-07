import { describe, it, expect, beforeEach } from "vitest";
import { PromptSearch } from "../src/search.ts";
import type { PromptEntry } from "../src/types.ts";

let search: PromptSearch;

beforeEach(() => {
  search = new PromptSearch();
});

function makeEntry(
  path: string,
  title: string,
  tags: string[] = [],
  type: "prompt" | "fragment" = "prompt",
): PromptEntry {
  return {
    path,
    frontmatter: {
      id: path,
      title,
      type,
      tags,
      folder: "/" + path.split("/").slice(0, -1).join("/"),
      variables: [],
      includes: [],
      created: "2026-03-07T14:00:00Z",
      modified: "2026-03-07T14:00:00Z",
      starred_versions: [],
    },
  };
}

describe("PromptSearch", () => {
  it("adds and searches documents", () => {
    search.addDocument(
      makeEntry("work/review.md", "Code Review Prompt", ["code-review"]),
      "You are a code reviewer.",
    );
    search.addDocument(
      makeEntry("work/debug.md", "Debug Assistant", ["debugging"]),
      "Help me debug this issue.",
    );

    const results = search.search("code review");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe("work/review.md");
  });

  it("boosts title matches", () => {
    search.addDocument(
      makeEntry("a.md", "Python Helper", ["python"]),
      "General assistant for coding.",
    );
    search.addDocument(
      makeEntry("b.md", "Coding Assistant", []),
      "Helps with Python programming.",
    );

    const results = search.search("Python");
    expect(results.length).toBe(2);
    // Title match should rank higher
    expect(results[0].path).toBe("a.md");
  });

  it("filters by tag", () => {
    search.addDocument(
      makeEntry("a.md", "Prompt A", ["tag1"]),
      "Body A.",
    );
    search.addDocument(
      makeEntry("b.md", "Prompt B", ["tag2"]),
      "Body B.",
    );

    const results = search.search("Prompt", { tag: "tag1" });
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("a.md");
  });

  it("filters by type", () => {
    search.addDocument(
      makeEntry("a.md", "Prompt A", [], "prompt"),
      "Body.",
    );
    search.addDocument(
      makeEntry("b.md", "Fragment B", [], "fragment"),
      "Body.",
    );

    const results = search.search("Body", { type: "fragment" });
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("b.md");
  });

  it("removes documents", () => {
    search.addDocument(makeEntry("a.md", "Test", []), "Body.");
    expect(search.documentCount).toBe(1);

    search.removeDocument("a.md");
    expect(search.documentCount).toBe(0);
  });

  it("replaces documents", () => {
    search.addDocument(makeEntry("a.md", "Old Title", []), "Old body.");
    search.addDocument(makeEntry("a.md", "New Title", []), "New body.");
    expect(search.documentCount).toBe(1);

    const results = search.search("New Title");
    expect(results).toHaveLength(1);
  });

  it("provides auto suggestions", () => {
    search.addDocument(
      makeEntry("a.md", "Code Review", ["code"]),
      "Review code quality.",
    );
    const suggestions = search.autoSuggest("cod");
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("tag filter uses exact match not substring", () => {
    search.addDocument(
      makeEntry("go.md", "Go Prompt", ["go"]),
      "Go content.",
    );
    search.addDocument(
      makeEntry("golang.md", "Golang Prompt", ["golang"]),
      "Golang content.",
    );

    const results = search.search("Prompt", { tag: "go" });
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("go.md");
  });
});
