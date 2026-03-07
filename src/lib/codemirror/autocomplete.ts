import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";

export interface AutocompleteContext {
  variables: string[];
  fragmentPaths: string[];
  tags: string[];
}

let completionContext: AutocompleteContext = {
  variables: [],
  fragmentPaths: [],
  tags: [],
};

export function updateCompletionContext(ctx: AutocompleteContext): void {
  completionContext = ctx;
}

function templateCompletions(
  context: CompletionContext,
): CompletionResult | null {
  // Check if we're inside {{ }}
  const before = context.matchBefore(/\{\{[^}]*/);
  if (!before) return null;

  const text = before.text;

  // Include completions
  if (text.includes("{{include:")) {
    return {
      from: before.from + text.indexOf("{{include:") + 10,
      options: completionContext.fragmentPaths.map((path) => ({
        label: path,
        type: "text",
        detail: "fragment",
      })),
      filter: true,
    };
  }

  // Variable completions
  if (text.includes("{{")) {
    return {
      from: before.from + text.lastIndexOf("{{") + 2,
      options: [
        ...completionContext.variables.map((v) => ({
          label: v,
          type: "variable",
          detail: "variable",
        })),
        {
          label: "include:",
          type: "keyword",
          detail: "include fragment",
        },
      ],
      filter: true,
    };
  }

  return null;
}

export const templateAutocompletion = autocompletion({
  override: [templateCompletions],
});
