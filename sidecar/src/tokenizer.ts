import { getEncoding, type TiktokenEncoding } from "js-tiktoken";

const encodingCache = new Map<string, ReturnType<typeof getEncoding>>();

function getEncodingForModel(model: string): TiktokenEncoding {
  // o200k_base: GPT-4o, GPT-4o-mini
  // cl100k_base: GPT-4, GPT-3.5-turbo, Claude (approximate)
  if (model.includes("4o") || model.includes("o1") || model.includes("o3")) {
    return "o200k_base";
  }
  return "cl100k_base";
}

function getEncoder(model: string) {
  const encodingName = getEncodingForModel(model);
  let encoder = encodingCache.get(encodingName);
  if (!encoder) {
    encoder = getEncoding(encodingName);
    encodingCache.set(encodingName, encoder);
  }
  return encoder;
}

export function countTokens(text: string, model: string): number {
  const encoder = getEncoder(model);
  return encoder.encode(text).length;
}

export function countTokensMultiModel(
  text: string,
  models: string[],
): Record<string, number> {
  const results: Record<string, number> = {};
  for (const model of models) {
    results[model] = countTokens(text, model);
  }
  return results;
}

export function isApproximate(model: string): boolean {
  return (
    model.includes("claude") ||
    model.includes("sonnet") ||
    model.includes("opus") ||
    model.includes("haiku")
  );
}
