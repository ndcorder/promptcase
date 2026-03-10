// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  openTabs,
  activeFile,
  editorContent,
  openFile,
  saveFile,
  closeTab,
  lintResults,
  fileHistory,
  markModified,
  hasUnsavedChanges,
} from "../../src/lib/stores/editor";
import { selectedPath } from "../../src/lib/stores/files";
import { api } from "../../src/lib/ipc";

beforeEach(() => {
  openTabs.set([]);
  activeFile.set(null);
  editorContent.set("");
  lintResults.set([]);
  fileHistory.set([]);
  selectedPath.set(null);
});

describe("openFile", () => {
  it("sets activeFile after opening", async () => {
    await api.createFile("open-test.md", "Open Test");
    await openFile("open-test.md");

    const file = get(activeFile);
    expect(file).not.toBeNull();
    expect(file!.path).toBe("open-test.md");
    expect(file!.frontmatter.title).toBe("Open Test");
    await api.deleteFile("open-test.md");
  });

  it("adds a tab for the opened file", async () => {
    await api.createFile("tab-test.md", "Tab Test");
    await openFile("tab-test.md");

    const tabs = get(openTabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe("tab-test.md");
    expect(tabs[0].active).toBe(true);
    await api.deleteFile("tab-test.md");
  });

  it("sets editorContent to the file body", async () => {
    await api.createFile("content-test.md", "Content Test");
    await api.writeFile("content-test.md", undefined, "Hello editor");
    await openFile("content-test.md");

    expect(get(editorContent)).toBe("Hello editor");
    await api.deleteFile("content-test.md");
  });

  it("does not duplicate tabs when opening the same file twice", async () => {
    await api.createFile("dup-test.md", "Dup Test");
    await openFile("dup-test.md");
    await openFile("dup-test.md");

    expect(get(openTabs)).toHaveLength(1);
    await api.deleteFile("dup-test.md");
  });

  it("deactivates previous tab when opening a new file", async () => {
    await api.createFile("first.md", "First");
    await api.createFile("second.md", "Second");

    await openFile("first.md");
    await openFile("second.md");

    const tabs = get(openTabs);
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.path === "first.md")!.active).toBe(false);
    expect(tabs.find((t) => t.path === "second.md")!.active).toBe(true);

    await api.deleteFile("first.md");
    await api.deleteFile("second.md");
  });
});

describe("saveFile", () => {
  it("calls writeFile with current editor content", async () => {
    await api.createFile("save-test.md", "Save Test");
    await openFile("save-test.md");

    editorContent.set("Updated content");
    markModified();
    await saveFile();

    const file = await api.readFile("save-test.md");
    expect(file.body).toBe("Updated content");
    await api.deleteFile("save-test.md");
  });

  it("clears the modified flag on the tab after save", async () => {
    await api.createFile("mod-test.md", "Mod Test");
    await openFile("mod-test.md");
    editorContent.set("Changed");
    markModified();

    expect(get(openTabs)[0].modified).toBe(true);
    await saveFile();
    expect(get(openTabs)[0].modified).toBe(false);
    await api.deleteFile("mod-test.md");
  });

  it("does nothing when no file is active", async () => {
    activeFile.set(null);
    await saveFile();
  });
});

describe("closeTab", () => {
  it("sets activeFile to null when last tab is closed", async () => {
    await api.createFile("last-tab.md", "Last Tab");
    await openFile("last-tab.md");

    expect(get(activeFile)).not.toBeNull();
    closeTab("last-tab.md");

    expect(get(activeFile)).toBeNull();
    expect(get(editorContent)).toBe("");
    expect(get(openTabs)).toEqual([]);
    await api.deleteFile("last-tab.md");
  });

  it("does nothing for a non-existent tab path", () => {
    openTabs.set([
      { path: "x.md", title: "X", modified: false, active: true },
    ]);
    closeTab("nonexistent.md");
    expect(get(openTabs)).toHaveLength(1);
  });
});

describe("hasUnsavedChanges", () => {
  it("is false when content matches file body", async () => {
    await api.createFile("unsaved-test.md", "Unsaved Test");
    await openFile("unsaved-test.md");
    expect(get(hasUnsavedChanges)).toBe(false);
    await api.deleteFile("unsaved-test.md");
  });

  it("is true when content differs from file body", async () => {
    await api.createFile("changed-test.md", "Changed Test");
    await openFile("changed-test.md");
    editorContent.set("Different content");
    expect(get(hasUnsavedChanges)).toBe(true);
    await api.deleteFile("changed-test.md");
  });

  it("is false when no file is active", () => {
    activeFile.set(null);
    editorContent.set("some content");
    expect(get(hasUnsavedChanges)).toBe(false);
  });
});
