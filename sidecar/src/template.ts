import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePromptFile } from "./frontmatter.ts";
import type { ResolvedPrompt, VariableDefinition } from "./types.ts";

const INCLUDE_PATTERN = /\{\{include:([^}]+)\}\}/g;
const VARIABLE_PATTERN = /\{\{([^}:]+)\}\}/g;
const MAX_DEPTH = 10;

export interface ResolveOptions {
  repoRoot: string;
  variables?: Record<string, string>;
  maxDepth?: number;
}

interface ResolveContext {
  repoRoot: string;
  visitedPaths: Set<string>;
  allVariables: VariableDefinition[];
  includedFragments: string[];
  depth: number;
  maxDepth: number;
}

async function readFragment(
  repoRoot: string,
  fragmentPath: string,
): Promise<{ body: string; variables: VariableDefinition[] }> {
  const fullPath = join(repoRoot, fragmentPath + ".md");
  const content = await readFile(fullPath, "utf-8");
  const parsed = parsePromptFile(fragmentPath + ".md", content);
  return { body: parsed.body, variables: parsed.frontmatter.variables };
}

async function resolveIncludes(
  text: string,
  ctx: ResolveContext,
): Promise<string> {
  if (ctx.depth >= ctx.maxDepth) {
    throw new Error(
      `Include depth exceeded maximum of ${ctx.maxDepth}`,
    );
  }

  const matches = [...text.matchAll(INCLUDE_PATTERN)];
  if (matches.length === 0) return text;

  let result = text;
  for (const match of matches) {
    const fragmentPath = match[1].trim();

    if (ctx.visitedPaths.has(fragmentPath)) {
      throw new Error(
        `Circular include detected: ${fragmentPath} (chain: ${[...ctx.visitedPaths].join(" -> ")} -> ${fragmentPath})`,
      );
    }

    ctx.visitedPaths.add(fragmentPath);
    ctx.includedFragments.push(fragmentPath);

    const fragment = await readFragment(ctx.repoRoot, fragmentPath);
    ctx.allVariables.push(...fragment.variables);

    const resolvedFragment = await resolveIncludes(fragment.body, {
      ...ctx,
      depth: ctx.depth + 1,
      visitedPaths: new Set(ctx.visitedPaths),
    });

    result = result.replace(match[0], resolvedFragment.trim());
  }

  return result;
}

function substituteVariables(
  text: string,
  variables: Record<string, string>,
  allDefs: VariableDefinition[],
): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const defaultsMap = new Map<string, string>();

  for (const def of allDefs) {
    if (def.default !== undefined) {
      defaultsMap.set(def.name, def.default);
    }
  }

  const result = text.replace(VARIABLE_PATTERN, (match, name: string) => {
    const trimmed = name.trim();
    if (trimmed.startsWith("include:")) return match;
    if (variables[trimmed] !== undefined) return variables[trimmed];
    if (defaultsMap.has(trimmed)) return defaultsMap.get(trimmed)!;
    unresolved.push(trimmed);
    return match;
  });

  return { text: result, unresolved };
}

export async function resolveTemplate(
  filePath: string,
  fileContent: string,
  options: ResolveOptions,
): Promise<ResolvedPrompt> {
  const parsed = parsePromptFile(filePath, fileContent);
  const ctx: ResolveContext = {
    repoRoot: options.repoRoot,
    visitedPaths: new Set<string>(),
    allVariables: [...parsed.frontmatter.variables],
    includedFragments: [],
    depth: 0,
    maxDepth: options.maxDepth ?? MAX_DEPTH,
  };

  const withIncludes = await resolveIncludes(parsed.body, ctx);

  const allVariables = options.variables ?? {};
  const { text, unresolved } = substituteVariables(
    withIncludes,
    allVariables,
    ctx.allVariables,
  );

  return {
    text: text.trim(),
    variables: allVariables,
    unresolvedVariables: [...new Set(unresolved)],
    includedFragments: ctx.includedFragments,
  };
}

export function extractVariableNames(body: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(VARIABLE_PATTERN.source, "g");
  while ((match = pattern.exec(body)) !== null) {
    const name = match[1].trim();
    if (!name.startsWith("include:")) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

export function extractIncludePaths(body: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(INCLUDE_PATTERN.source, "g");
  while ((match = pattern.exec(body)) !== null) {
    paths.push(match[1].trim());
  }
  return [...new Set(paths)];
}
