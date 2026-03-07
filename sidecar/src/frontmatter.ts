import matter from "gray-matter";
import crypto from "node:crypto";
import type { PromptFile, PromptFrontmatter } from "./types.ts";

function generateId(): string {
  return crypto.randomBytes(4).toString("hex");
}

function extractIncludes(body: string): string[] {
  const pattern = /\{\{include:([^}]+)\}\}/g;
  const includes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    includes.push(match[1].trim());
  }
  return includes;
}

export function parsePromptFile(
  filePath: string,
  content: string,
): PromptFile {
  const parsed = matter(content);
  const data = parsed.data as Record<string, unknown>;

  const now = new Date().toISOString();
  const folder =
    "/" +
    filePath
      .replace(/\\/g, "/")
      .split("/")
      .slice(0, -1)
      .join("/");

  const frontmatter: PromptFrontmatter = {
    id: (data.id as string) || generateId(),
    title: (data.title as string) || "",
    type: (data.type as "prompt" | "fragment") || "prompt",
    tags: (data.tags as string[]) || [],
    folder,
    model_targets: (data.model_targets as string[]) || undefined,
    variables: (data.variables as PromptFrontmatter["variables"]) || [],
    includes: extractIncludes(parsed.content),
    created: (data.created as string) || now,
    modified: (data.modified as string) || now,
    starred_versions:
      (data.starred_versions as PromptFrontmatter["starred_versions"]) || [],
  };

  return {
    path: filePath,
    frontmatter,
    body: parsed.content,
    raw: content,
  };
}

export function serializePromptFile(
  frontmatter: PromptFrontmatter,
  body: string,
): string {
  const fm: Record<string, unknown> = {
    id: frontmatter.id,
    title: frontmatter.title,
    type: frontmatter.type,
    tags: frontmatter.tags,
  };

  if (frontmatter.model_targets && frontmatter.model_targets.length > 0) {
    fm.model_targets = frontmatter.model_targets;
  }

  if (frontmatter.variables.length > 0) {
    fm.variables = frontmatter.variables;
  }

  if (frontmatter.includes.length > 0) {
    fm.includes = frontmatter.includes;
  }

  fm.created = frontmatter.created;
  fm.modified = new Date().toISOString();

  if (frontmatter.starred_versions.length > 0) {
    fm.starred_versions = frontmatter.starred_versions;
  }

  return matter.stringify(body, fm);
}

export function updateFrontmatter(
  content: string,
  updates: Partial<PromptFrontmatter>,
): string {
  const parsed = matter(content);
  const data = { ...parsed.data, ...updates };
  data.modified = new Date().toISOString();
  return matter.stringify(parsed.content, data);
}
