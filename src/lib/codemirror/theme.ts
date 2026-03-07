import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const promptcaseTheme = EditorView.theme(
  {
    "&": {
      color: "#d4d4d8",
      backgroundColor: "#18181b",
      fontSize: "14px",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    },
    ".cm-content": {
      caretColor: "#a78bfa",
      padding: "12px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#a78bfa",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "#3f3f4620",
      },
    ".cm-panels": {
      backgroundColor: "#18181b",
      color: "#d4d4d8",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid #27272a",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #27272a",
    },
    ".cm-searchMatch": {
      backgroundColor: "#facc1530",
      outline: "1px solid #facc1550",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#facc1550",
    },
    ".cm-activeLine": {
      backgroundColor: "#27272a40",
    },
    ".cm-selectionMatch": {
      backgroundColor: "#3b82f620",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#3b82f630",
    },
    ".cm-gutters": {
      backgroundColor: "#18181b",
      color: "#52525b",
      border: "none",
      paddingRight: "8px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#27272a40",
      color: "#a1a1aa",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#27272a",
      color: "#71717a",
      border: "none",
    },
    ".cm-tooltip": {
      border: "1px solid #3f3f46",
      backgroundColor: "#27272a",
      color: "#d4d4d8",
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "#3f3f46",
      borderBottomColor: "#3f3f46",
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#27272a",
      borderBottomColor: "#27272a",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "#3f3f46",
        color: "#d4d4d8",
      },
    },
  },
  { dark: true },
);

export const promptcaseHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword, color: "#c084fc" },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: "#d4d4d8" },
    { tag: [t.function(t.variableName), t.labelName], color: "#60a5fa" },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#c084fc" },
    { tag: [t.definition(t.name), t.separator], color: "#d4d4d8" },
    { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#34d399" },
    { tag: [t.number], color: "#fb923c" },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#38bdf8" },
    { tag: [t.meta, t.comment], color: "#71717a" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "#38bdf8", textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: "#e2e8f0" },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#c084fc" },
    { tag: [t.processingInstruction, t.string, t.inserted], color: "#a3e635" },
    { tag: t.invalid, color: "#ef4444" },
  ]),
);
