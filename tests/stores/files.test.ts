import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  promptEntries,
  selectedPath,
  tagFilter,
  allTags,
  filteredEntries,
  folderTree,
} from "../../src/lib/stores/files";
import type { PromptEntry } from "../../src/lib/types";

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

const testEntries: PromptEntry[] = [
  makeEntry("work/review.md", "Code Review", ["code-review", "dev"]),
  makeEntry("work/debug.md", "Debug Assistant", ["debugging", "dev"]),
  makeEntry("personal/story.md", "Story Writer", ["creative"]),
  makeEntry("fragments/persona.md", "Dev Persona", ["persona"], "fragment"),
];

beforeEach(() => {
  promptEntries.set(testEntries);
  tagFilter.set("");
  selectedPath.set(null);
});

describe("allTags", () => {
  it("collects all unique tags", () => {
    const tags = get(allTags);
    expect(tags).toEqual(["code-review", "creative", "debugging", "dev", "persona"]);
  });
});

describe("filteredEntries", () => {
  it("returns all entries when no filter", () => {
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(4);
  });

  it("filters by tag", () => {
    tagFilter.set("dev");
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.path)).toContain("work/review.md");
    expect(entries.map((e) => e.path)).toContain("work/debug.md");
  });

  it("filters case-insensitively", () => {
    tagFilter.set("Creative");
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("personal/story.md");
  });
});

describe("folderTree", () => {
  it("builds a tree from entries", () => {
    const tree = get(folderTree);
    expect(tree.children.length).toBeGreaterThan(0);

    const workFolder = tree.children.find((c) => c.name === "work");
    expect(workFolder).toBeTruthy();
    expect(workFolder!.files).toHaveLength(2);

    const personalFolder = tree.children.find((c) => c.name === "personal");
    expect(personalFolder).toBeTruthy();
    expect(personalFolder!.files).toHaveLength(1);
  });

  it("sorts folders and files", () => {
    const tree = get(folderTree);
    const names = tree.children.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });
});
