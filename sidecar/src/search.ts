import MiniSearch from "minisearch";
import type { PromptEntry, SearchFilters, SearchResult } from "./types.ts";

export interface SearchableDoc {
  id: string;
  path: string;
  title: string;
  tags: string;
  body: string;
  variables: string;
  folder: string;
  type: string;
}

export class PromptSearch {
  private index: MiniSearch<SearchableDoc>;

  constructor() {
    this.index = new MiniSearch<SearchableDoc>({
      fields: ["title", "tags", "body", "variables", "folder"],
      storeFields: ["path", "title", "tags", "folder", "type"],
      searchOptions: {
        boost: { title: 3, tags: 2, body: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  addDocument(entry: PromptEntry, body: string): void {
    const doc: SearchableDoc = {
      id: entry.path,
      path: entry.path,
      title: entry.frontmatter.title,
      tags: entry.frontmatter.tags.join(" "),
      body,
      variables: entry.frontmatter.variables.map((v) => v.name).join(" "),
      folder: entry.frontmatter.folder,
      type: entry.frontmatter.type,
    };

    if (this.index.has(entry.path)) {
      this.index.replace(doc);
    } else {
      this.index.add(doc);
    }
  }

  removeDocument(path: string): void {
    if (this.index.has(path)) {
      this.index.discard(path);
    }
  }

  search(query: string, filters?: SearchFilters): SearchResult[] {
    const results = this.index.search(query, {
      filter: filters ? buildFilter(filters) : undefined,
    });

    return results.map((r) => ({
      path: r.path as string,
      title: r.title as string,
      snippet: "",
      score: r.score,
      tags: ((r.tags as string) || "").split(" ").filter(Boolean),
    }));
  }

  autoSuggest(query: string): string[] {
    return this.index.autoSuggest(query).map((s) => s.suggestion);
  }

  clear(): void {
    this.index.removeAll();
  }

  get documentCount(): number {
    return this.index.documentCount;
  }
}

function buildFilter(
  filters: SearchFilters,
) {
  return (result: Record<string, unknown>) => {
    if (filters.tag) {
      const tags = (result.tags as string) || "";
      if (!tags.split(" ").includes(filters.tag)) return false;
    }
    if (filters.folder && !(result.folder as string || "").startsWith(filters.folder))
      return false;
    if (filters.type && result.type !== filters.type) return false;
    return true;
  };
}
