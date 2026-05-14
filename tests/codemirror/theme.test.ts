import { describe, it, expect, vi } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so capture refs are available
const { captured } = vi.hoisted(() => {
  const captured: {
    themeConfig: any;
    themeOptions: any;
    highlightStyles: any[];
  } = { themeConfig: null, themeOptions: null, highlightStyles: [] };
  return { captured };
});

vi.mock("@codemirror/view", () => ({
  EditorView: {
    theme: vi.fn((config: any, options: any) => {
      captured.themeConfig = config;
      captured.themeOptions = options;
      return { type: "theme", config, options };
    }),
  },
}));

vi.mock("@codemirror/language", () => ({
  HighlightStyle: {
    define: vi.fn((styles: any[]) => {
      captured.highlightStyles = styles;
      return { type: "HighlightStyle", styles };
    }),
  },
  syntaxHighlighting: vi.fn((hs: any) => ({ type: "syntaxHighlighting", hs })),
}));

vi.mock("@lezer/highlight", () => {
  const tag = (name: string) => ({ tag: name });
  const modifier = (name: string) => (inner: any) => ({ tag: `${name}(${inner?.tag ?? inner})` });
  return {
    tags: {
      keyword: tag("keyword"),
      name: tag("name"),
      deleted: tag("deleted"),
      character: tag("character"),
      macroName: tag("macroName"),
      labelName: tag("labelName"),
      variableName: tag("variableName"),
      color: tag("color"),
      separator: tag("separator"),
      typeName: tag("typeName"),
      className: tag("className"),
      changed: tag("changed"),
      annotation: tag("annotation"),
      modifier: tag("modifier"),
      self: tag("self"),
      namespace: tag("namespace"),
      number: tag("number"),
      operator: tag("operator"),
      operatorKeyword: tag("operatorKeyword"),
      url: tag("url"),
      escape: tag("escape"),
      regexp: tag("regexp"),
      link: tag("link"),
      meta: tag("meta"),
      comment: tag("comment"),
      strong: tag("strong"),
      emphasis: tag("emphasis"),
      strikethrough: tag("strikethrough"),
      heading: tag("heading"),
      atom: tag("atom"),
      bool: tag("bool"),
      processingInstruction: tag("processingInstruction"),
      string: tag("string"),
      inserted: tag("inserted"),
      invalid: tag("invalid"),
      function: modifier("function"),
      constant: modifier("constant"),
      standard: modifier("standard"),
      definition: modifier("definition"),
      special: modifier("special"),
    },
  };
});

import {
  promptcaseTheme,
  promptcaseHighlighting,
} from "../../src/lib/codemirror/theme";

describe("theme", () => {
  describe("promptcaseTheme", () => {
    it("is defined", () => {
      expect(promptcaseTheme).toBeDefined();
    });

    it("was created with dark mode", () => {
      expect(captured.themeOptions).toEqual({ dark: true });
    });

    it("sets base font and background color", () => {
      expect(captured.themeConfig["&"]).toBeDefined();
      expect(captured.themeConfig["&"].backgroundColor).toBe("#1e1e1e");
      expect(captured.themeConfig["&"].color).toBe("#f5f5f7");
      expect(captured.themeConfig["&"].fontSize).toBe("14px");
    });

    it("sets caret color in .cm-content", () => {
      expect(captured.themeConfig[".cm-content"]).toBeDefined();
      expect(captured.themeConfig[".cm-content"].caretColor).toBe("#0a84ff");
    });

    it("styles gutters with no border", () => {
      expect(captured.themeConfig[".cm-gutters"]).toBeDefined();
      expect(captured.themeConfig[".cm-gutters"].border).toBe("none");
      expect(captured.themeConfig[".cm-gutters"].backgroundColor).toBe("#1e1e1e");
    });

    it("styles tooltips with border-radius", () => {
      expect(captured.themeConfig[".cm-tooltip"]).toBeDefined();
      expect(captured.themeConfig[".cm-tooltip"].borderRadius).toBe("6px");
    });

    it("includes cursor styling", () => {
      expect(captured.themeConfig[".cm-cursor, .cm-dropCursor"]).toBeDefined();
      expect(
        captured.themeConfig[".cm-cursor, .cm-dropCursor"].borderLeftColor,
      ).toBe("#0a84ff");
    });

    it("includes active line styling", () => {
      expect(captured.themeConfig[".cm-activeLine"]).toBeDefined();
    });

    it("includes search match styling", () => {
      expect(captured.themeConfig[".cm-searchMatch"]).toBeDefined();
      expect(
        captured.themeConfig[".cm-searchMatch.cm-searchMatch-selected"],
      ).toBeDefined();
    });

    it("includes panel input and button styling", () => {
      expect(
        captured.themeConfig[
          ".cm-panels input[type=text], .cm-panels input[type=checkbox]"
        ],
      ).toBeDefined();
      expect(captured.themeConfig[".cm-panels button"]).toBeDefined();
    });
  });

  describe("promptcaseHighlighting", () => {
    it("is defined", () => {
      expect(promptcaseHighlighting).toBeDefined();
    });

    it("was created with HighlightStyle.define", () => {
      // Verified by captured.highlightStyles being populated
      expect(captured.highlightStyles.length).toBeGreaterThan(0);
    });

    it("was wrapped with syntaxHighlighting", () => {
      // syntaxHighlighting wraps the HighlightStyle -- verified by the
      // export having the shape our mock returns
      expect(promptcaseHighlighting).toHaveProperty("type", "syntaxHighlighting");
    });

    it("defines multiple highlight rules", () => {
      expect(Array.isArray(captured.highlightStyles)).toBe(true);
      expect(captured.highlightStyles.length).toBeGreaterThan(10);
    });

    it("includes keyword color (purple)", () => {
      const keywordRule = captured.highlightStyles.find(
        (s: any) => s.color === "#bf5af2" && s.tag?.tag === "keyword",
      );
      expect(keywordRule).toBeDefined();
    });

    it("includes number color (orange)", () => {
      const numRule = captured.highlightStyles.find(
        (s: any) => s.color === "#ff9f0a",
      );
      expect(numRule).toBeDefined();
    });

    it("includes invalid color (red)", () => {
      const invalidRule = captured.highlightStyles.find(
        (s: any) => s.color === "#ff453a",
      );
      expect(invalidRule).toBeDefined();
    });

    it("includes strong/emphasis/strikethrough rules", () => {
      const strong = captured.highlightStyles.find(
        (s: any) => s.fontWeight === "bold" && !s.color,
      );
      const emphasis = captured.highlightStyles.find(
        (s: any) => s.fontStyle === "italic",
      );
      const strike = captured.highlightStyles.find(
        (s: any) => s.textDecoration === "line-through",
      );
      expect(strong).toBeDefined();
      expect(emphasis).toBeDefined();
      expect(strike).toBeDefined();
    });
  });
});
