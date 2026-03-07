import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePromptFile } from "./frontmatter.ts";
import { extractIncludePaths, extractVariableNames } from "./template.ts";
import type { LintResult, LintSeverity, RepoConfig } from "./types.ts";

export interface LintContext {
  repoRoot: string;
  config: RepoConfig;
  allPromptPaths?: string[];
}

function severity(
  rule: string,
  config: RepoConfig,
): LintSeverity {
  return config.lint_rules[rule] ?? "warning";
}

export async function lintPrompt(
  filePath: string,
  content: string,
  ctx: LintContext,
): Promise<LintResult[]> {
  const results: LintResult[] = [];
  const parsed = parsePromptFile(filePath, content);
  const { frontmatter, body } = parsed;

  // missing-title
  if (!frontmatter.title || frontmatter.title.trim() === "") {
    results.push({
      rule: "missing-title",
      severity: severity("missing-title", ctx.config),
      message: "Prompt file has no title in frontmatter",
      line: 1,
    });
  }

  // empty-body
  if (!body || body.trim() === "") {
    results.push({
      rule: "empty-body",
      severity: severity("empty-body", ctx.config),
      message: "Prompt has frontmatter but no body content",
    });
  }

  // Variable analysis
  const declaredVarNames = new Set(frontmatter.variables.map((v) => v.name));
  const usedVarNames = extractVariableNames(body);
  const usedVarSet = new Set(usedVarNames);

  // unresolved-variable
  for (const name of usedVarNames) {
    if (!declaredVarNames.has(name)) {
      const line = findVariableLine(body, name);
      results.push({
        rule: "unresolved-variable",
        severity: severity("unresolved-variable", ctx.config),
        message: `Variable "{{${name}}}" is used but not declared in frontmatter`,
        line,
      });
    }
  }

  // unused-variable
  for (const v of frontmatter.variables) {
    if (!usedVarSet.has(v.name)) {
      results.push({
        rule: "unused-variable",
        severity: severity("unused-variable", ctx.config),
        message: `Variable "${v.name}" is declared but never referenced in body`,
      });
    }
  }

  // missing-description
  for (const v of frontmatter.variables) {
    if (!v.description) {
      results.push({
        rule: "missing-description",
        severity: severity("missing-description", ctx.config),
        message: `Variable "${v.name}" has no description`,
      });
    }
  }

  // Include analysis
  const includePaths = extractIncludePaths(body);

  // broken-include
  for (const incPath of includePaths) {
    const fullPath = join(ctx.repoRoot, incPath + ".md");
    try {
      await readFile(fullPath, "utf-8");
    } catch {
      const line = findIncludeLine(body, incPath);
      results.push({
        rule: "broken-include",
        severity: severity("broken-include", ctx.config),
        message: `Include "{{include:${incPath}}}" references a file that doesn't exist`,
        line,
      });
    }
  }

  // circular-include (checks one level - deep cycle detection happens during resolution)
  await checkCircularIncludes(
    includePaths,
    ctx.repoRoot,
    new Set([filePath.replace(/\.md$/, "")]),
    results,
    ctx.config,
  );

  // duplicate-variable (only detectable after resolving includes, do a shallow check)
  if (includePaths.length > 0) {
    await checkDuplicateVariables(
      includePaths,
      frontmatter.variables,
      ctx.repoRoot,
      results,
      ctx.config,
    );
  }

  return results;
}

async function checkCircularIncludes(
  includePaths: string[],
  repoRoot: string,
  visited: Set<string>,
  results: LintResult[],
  config: RepoConfig,
  depth = 0,
): Promise<void> {
  if (depth > 10) {
    results.push({
      rule: "include-depth",
      severity: severity("include-depth", config),
      message: "Fragment nesting exceeds maximum depth of 10",
    });
    return;
  }

  for (const incPath of includePaths) {
    if (visited.has(incPath)) {
      results.push({
        rule: "circular-include",
        severity: severity("circular-include", config),
        message: `Circular include detected: ${incPath}`,
      });
      continue;
    }

    try {
      const content = await readFile(
        join(repoRoot, incPath + ".md"),
        "utf-8",
      );
      const childIncludes = extractIncludePaths(content);
      if (childIncludes.length > 0) {
        const newVisited = new Set(visited);
        newVisited.add(incPath);
        await checkCircularIncludes(
          childIncludes,
          repoRoot,
          newVisited,
          results,
          config,
          depth + 1,
        );
      }
    } catch {
      // broken-include already handled above
    }
  }
}

async function checkDuplicateVariables(
  includePaths: string[],
  parentVars: { name: string; default?: string }[],
  repoRoot: string,
  results: LintResult[],
  config: RepoConfig,
): Promise<void> {
  const varDefaults = new Map<string, string[]>();

  for (const v of parentVars) {
    varDefaults.set(v.name, [v.default ?? "<none>"]);
  }

  for (const incPath of includePaths) {
    try {
      const content = await readFile(
        join(repoRoot, incPath + ".md"),
        "utf-8",
      );
      const parsed = parsePromptFile(incPath + ".md", content);
      for (const v of parsed.frontmatter.variables) {
        const existing = varDefaults.get(v.name);
        const defaultVal = v.default ?? "<none>";
        if (existing) {
          if (!existing.includes(defaultVal)) {
            existing.push(defaultVal);
          }
        } else {
          varDefaults.set(v.name, [defaultVal]);
        }
      }
    } catch {
      // skip unreadable fragments
    }
  }

  for (const [name, defaults] of varDefaults) {
    if (defaults.length > 1) {
      results.push({
        rule: "duplicate-variable",
        severity: severity("duplicate-variable", config),
        message: `Variable "${name}" is declared in multiple fragments with different defaults`,
      });
    }
  }
}

function findVariableLine(body: string, varName: string): number {
  const lines = body.split("\n");
  const pattern = `{{${varName}}}`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i + 1;
  }
  return 1;
}

function findIncludeLine(body: string, incPath: string): number {
  const lines = body.split("\n");
  const pattern = `{{include:${incPath}}}`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i + 1;
  }
  return 1;
}

export async function lintAll(
  promptFiles: Array<{ path: string; content: string }>,
  ctx: LintContext,
): Promise<Record<string, LintResult[]>> {
  const results: Record<string, LintResult[]> = {};

  // Check for orphaned fragments
  const allIncludes = new Set<string>();
  const fragments: string[] = [];

  for (const file of promptFiles) {
    const parsed = parsePromptFile(file.path, file.content);
    const includes = extractIncludePaths(parsed.body);
    for (const inc of includes) allIncludes.add(inc);
    if (parsed.frontmatter.type === "fragment") {
      fragments.push(file.path.replace(/\.md$/, ""));
    }
  }

  for (const file of promptFiles) {
    const fileResults = await lintPrompt(file.path, file.content, ctx);

    // orphaned-fragment check
    const pathWithoutExt = file.path.replace(/\.md$/, "");
    const parsed = parsePromptFile(file.path, file.content);
    if (
      parsed.frontmatter.type === "fragment" &&
      !allIncludes.has(pathWithoutExt)
    ) {
      fileResults.push({
        rule: "orphaned-fragment",
        severity: severity("orphaned-fragment", ctx.config),
        message: `Fragment "${file.path}" is not included by any prompt`,
      });
    }

    if (fileResults.length > 0) {
      results[file.path] = fileResults;
    }
  }

  return results;
}
