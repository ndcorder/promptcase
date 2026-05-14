import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { scanResults } from "../../src/lib/stores/scanner";
import type { ScannedPrompt } from "../../src/lib/types";

beforeEach(() => {
  scanResults.set([]);
});

describe("scanResults store", () => {
  it("initializes as empty array", () => {
    expect(get(scanResults)).toEqual([]);
  });

  it("can set and get values", () => {
    const items: ScannedPrompt[] = [
      { sourcePath: "/a.md", sourceType: "markdown", title: "A", content: "body", confidence: 0.9 },
    ];
    scanResults.set(items);
    expect(get(scanResults)).toEqual(items);
  });

  it("can update values", () => {
    scanResults.set([{ sourcePath: "/a.md", sourceType: "md", title: "A", content: "x", confidence: 1 }]);
    scanResults.update((v) => [...v, { sourcePath: "/b.md", sourceType: "md", title: "B", content: "y", confidence: 0.5 }]);
    expect(get(scanResults)).toHaveLength(2);
  });
});
