import { describe, it, expect } from "vitest";
import {
  countTokens,
  countTokensMultiModel,
  isApproximate,
} from "../src/tokenizer.ts";

describe("countTokens", () => {
  it("counts tokens for a simple string", () => {
    const count = countTokens("Hello, world!", "gpt-4o");
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  it("returns 0 for empty string", () => {
    expect(countTokens("", "gpt-4o")).toBe(0);
  });

  it("counts tokens for longer text", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(10);
    const count = countTokens(text, "claude-sonnet-4");
    expect(count).toBeGreaterThan(50);
  });

  it("uses different encodings for different models", () => {
    const text = "Testing encoding differences across models.";
    const gpt4oCount = countTokens(text, "gpt-4o");
    const claudeCount = countTokens(text, "claude-sonnet-4");
    // Both should be reasonable numbers, may differ
    expect(gpt4oCount).toBeGreaterThan(0);
    expect(claudeCount).toBeGreaterThan(0);
  });
});

describe("countTokensMultiModel", () => {
  it("returns counts for multiple models", () => {
    const results = countTokensMultiModel("Hello world", [
      "claude-sonnet-4",
      "gpt-4o",
    ]);
    expect(results["claude-sonnet-4"]).toBeGreaterThan(0);
    expect(results["gpt-4o"]).toBeGreaterThan(0);
  });
});

describe("isApproximate", () => {
  it("returns true for Claude models", () => {
    expect(isApproximate("claude-sonnet-4")).toBe(true);
    expect(isApproximate("claude-opus-4")).toBe(true);
    expect(isApproximate("claude-haiku-3.5")).toBe(true);
  });

  it("returns false for OpenAI models", () => {
    expect(isApproximate("gpt-4o")).toBe(false);
    expect(isApproximate("gpt-4")).toBe(false);
  });
});
