// Minimal YAML-like parser/serializer for .promptcase.yaml config
// Uses JSON as intermediate since our config is simple key-value

export function parse(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");

  let currentKey = "";
  let inBlock: "array" | "object" | false = false;
  let arrayValues: unknown[] = [];
  let objectValues: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indented = line !== line.trimStart();

    // Indented line belonging to current block
    if (indented && inBlock) {
      if (inBlock === "array" && trimmed.startsWith("- ")) {
        const val = parseValue(trimmed.slice(2).trim());
        arrayValues.push(val);
        continue;
      }
      if (inBlock === "object") {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0) {
          const k = trimmed.slice(0, colonIdx).trim();
          const v = trimmed.slice(colonIdx + 1).trim();
          objectValues[k] = parseValue(v) as string;
          continue;
        }
      }
    }

    // End previous block if we hit a non-indented line
    if (inBlock) {
      result[currentKey] = inBlock === "array" ? arrayValues : objectValues;
      inBlock = false;
      arrayValues = [];
      objectValues = {};
    }

    // Key-value pair
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const valueStr = trimmed.slice(colonIdx + 1).trim();

      if (!valueStr) {
        // Peek ahead to determine if array or object
        currentKey = key;
        const nextContent = peekNextContent(lines, i + 1);
        if (nextContent !== null && nextContent.startsWith("- ")) {
          inBlock = "array";
          arrayValues = [];
        } else {
          inBlock = "object";
          objectValues = {};
        }
        continue;
      }

      result[key] = parseValue(valueStr);
    }
  }

  // Close any trailing block
  if (inBlock) {
    result[currentKey] = inBlock === "array" ? arrayValues : objectValues;
  }

  return result;
}

function peekNextContent(lines: string[], from: number): string | null {
  for (let i = from; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return trimmed;
  }
  return null;
}

function parseValue(str: string): unknown {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  if (/^\d+\.\d+$/.test(str)) return parseFloat(str);
  // Quoted string
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1).replace(/\\"/g, '"');
  }
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1);
  }
  return str;
}

export function stringify(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          lines.push(`  - ${JSON.stringify(item)}`);
        } else {
          lines.push(`  - ${serializeValue(item)}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${k}: ${serializeValue(v)}`);
      }
    } else {
      lines.push(`${key}: ${serializeValue(value)}`);
    }
  }

  return lines.join("\n") + "\n";
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") {
    const hasDouble = value.includes('"');
    const hasSingle = value.includes("'");
    if (hasDouble && hasSingle) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    if (hasDouble) return `'${value}'`;
    return `"${value}"`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value === null) return "null";
  return String(value);
}
