import { describe, it, expect } from "vitest";
import { templateHighlightingStyles } from "../../src/lib/codemirror/template-styles";

describe("template-styles", () => {
  it("exports a non-empty string", () => {
    expect(typeof templateHighlightingStyles).toBe("string");
    expect(templateHighlightingStyles.length).toBeGreaterThan(0);
  });

  it("contains the cm-template-variable class", () => {
    expect(templateHighlightingStyles).toContain(".cm-template-variable");
  });

  it("contains the cm-template-include class", () => {
    expect(templateHighlightingStyles).toContain(".cm-template-include");
  });

  it("contains the cm-frontmatter class", () => {
    expect(templateHighlightingStyles).toContain(".cm-frontmatter");
  });

  it("includes color declarations for each class", () => {
    expect(templateHighlightingStyles).toContain("#ff9f0a"); // variable color
    expect(templateHighlightingStyles).toContain("#bf5af2"); // include color
  });

  it("includes border-radius styling", () => {
    expect(templateHighlightingStyles).toContain("border-radius");
  });
});
