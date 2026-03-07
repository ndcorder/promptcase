import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  openTabs,
  activeFile,
  editorContent,
  closeTab,
  showSidebar,
  showInspector,
  showBottomPanel,
  showPreview,
} from "../../src/lib/stores/editor";
beforeEach(() => {
  openTabs.set([]);
  activeFile.set(null);
  editorContent.set("");
});

describe("tab management", () => {
  it("starts with empty tabs", () => {
    expect(get(openTabs)).toEqual([]);
  });

  it("closes a tab", () => {
    openTabs.set([
      { path: "a.md", title: "A", modified: false, active: true },
      { path: "b.md", title: "B", modified: false, active: false },
    ]);

    closeTab("a.md");
    const tabs = get(openTabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe("b.md");
    expect(tabs[0].active).toBe(true);
  });

  it("clears state when last tab is closed", () => {
    openTabs.set([
      { path: "a.md", title: "A", modified: false, active: true },
    ]);

    closeTab("a.md");
    expect(get(openTabs)).toEqual([]);
    expect(get(activeFile)).toBeNull();
    expect(get(editorContent)).toBe("");
  });
});

describe("panel toggles", () => {
  it("toggles sidebar visibility", () => {
    expect(get(showSidebar)).toBe(true);
    showSidebar.set(false);
    expect(get(showSidebar)).toBe(false);
  });

  it("toggles inspector visibility", () => {
    expect(get(showInspector)).toBe(true);
    showInspector.set(false);
    expect(get(showInspector)).toBe(false);
  });

  it("toggles bottom panel visibility", () => {
    expect(get(showBottomPanel)).toBe(true);
    showBottomPanel.set(false);
    expect(get(showBottomPanel)).toBe(false);
  });

  it("toggles preview", () => {
    expect(get(showPreview)).toBe(false);
    showPreview.set(true);
    expect(get(showPreview)).toBe(true);
  });
});
