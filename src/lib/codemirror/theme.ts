import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const promptcaseTheme = EditorView.theme(
  {
    "&": {
      color: "#f5f5f7",
      backgroundColor: "#1e1e1e",
      fontSize: "14px",
      fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
    },
    ".cm-content": {
      caretColor: "#0a84ff",
      padding: "12px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#0a84ff",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgba(10, 132, 255, 0.25)",
      },
    ".cm-panels": {
      backgroundColor: "#252525",
      color: "#f5f5f7",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid rgba(255, 255, 255, 0.10)",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(255, 159, 10, 0.25)",
      outline: "1px solid rgba(255, 159, 10, 0.4)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(255, 159, 10, 0.40)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "rgba(10, 132, 255, 0.15)",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "rgba(10, 132, 255, 0.20)",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "rgba(255, 255, 255, 0.20)",
      border: "none",
      paddingRight: "8px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      color: "rgba(255, 255, 255, 0.45)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      color: "rgba(255, 255, 255, 0.35)",
      border: "none",
    },
    ".cm-tooltip": {
      border: "1px solid rgba(255, 255, 255, 0.10)",
      backgroundColor: "#2d2d2d",
      color: "#f5f5f7",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "rgba(255, 255, 255, 0.10)",
      borderBottomColor: "rgba(255, 255, 255, 0.10)",
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#2d2d2d",
      borderBottomColor: "#2d2d2d",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "rgba(10, 132, 255, 0.20)",
        color: "#f5f5f7",
      },
    },
  },
  { dark: true },
);

export const promptcaseHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword, color: "#bf5af2" },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: "#f5f5f7" },
    { tag: [t.function(t.variableName), t.labelName], color: "#0a84ff" },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#bf5af2" },
    { tag: [t.definition(t.name), t.separator], color: "#f5f5f7" },
    { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#30d158" },
    { tag: [t.number], color: "#ff9f0a" },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#64d2ff" },
    { tag: [t.meta, t.comment], color: "rgba(255, 255, 255, 0.30)" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "#64d2ff", textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: "#f5f5f7" },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#bf5af2" },
    { tag: [t.processingInstruction, t.string, t.inserted], color: "#30d158" },
    { tag: t.invalid, color: "#ff453a" },
  ]),
);
