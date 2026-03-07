import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const variableDeco = Decoration.mark({
  class: "cm-template-variable",
});

const includeDeco = Decoration.mark({
  class: "cm-template-include",
});

const frontmatterDeco = Decoration.mark({
  class: "cm-frontmatter",
});

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const text = doc.toString();

  // Frontmatter detection
  if (text.startsWith("---")) {
    const endIdx = text.indexOf("---", 3);
    if (endIdx > 0) {
      const fmEnd = endIdx + 3;
      builder.add(0, fmEnd, frontmatterDeco);
    }
  }

  // Collect all decoration ranges to sort before adding to builder
  const ranges: { from: number; to: number; decoration: Decoration }[] = [];

  // Template variables: {{variableName}}
  const varPattern = /\{\{(?!include:)([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = varPattern.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length, decoration: variableDeco });
  }

  // Include directives: {{include:path}}
  const includePattern = /\{\{include:[^}]+\}\}/g;
  while ((match = includePattern.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length, decoration: includeDeco });
  }

  // RangeSetBuilder requires ascending `from` order
  ranges.sort((a, b) => a.from - b.from);
  for (const r of ranges) {
    builder.add(r.from, r.to, r.decoration);
  }

  return builder.finish();
}

export const templateHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const templateHighlightingStyles = `
  .cm-template-variable {
    color: #f59e0b;
    background: #f59e0b15;
    border-radius: 2px;
    padding: 0 1px;
  }
  .cm-template-include {
    color: #8b5cf6;
    background: #8b5cf615;
    border-radius: 2px;
    padding: 0 1px;
  }
  .cm-frontmatter {
    color: #71717a;
  }
`;
