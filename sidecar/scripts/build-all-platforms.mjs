#!/usr/bin/env node
/**
 * Cross-compiles sidecar binaries for all platforms using Bun.
 * Outputs to src-tauri/binaries/ with correct target-triple naming.
 *
 * Usage: node scripts/build-all-platforms.mjs [--platform <name>]
 *   --platform: optional, one of: darwin-arm64, darwin-x64, linux-x64, windows-x64
 *               if omitted, builds all platforms
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  { bun: "bun-darwin-arm64", triple: "aarch64-apple-darwin", ext: "" },
  { bun: "bun-darwin-x64", triple: "x86_64-apple-darwin", ext: "" },
  { bun: "bun-linux-x64", triple: "x86_64-unknown-linux-gnu", ext: "" },
  { bun: "bun-windows-x64", triple: "x86_64-pc-windows-msvc", ext: ".exe" },
];

const platformArg = process.argv.indexOf("--platform");
const selectedPlatform = platformArg !== -1 ? process.argv[platformArg + 1] : null;

const destDir = resolve(import.meta.dirname, "..", "..", "src-tauri", "binaries");
mkdirSync(destDir, { recursive: true });

const entrypoint = resolve(import.meta.dirname, "..", "src", "index.ts");

for (const target of targets) {
  if (selectedPlatform && !target.bun.includes(selectedPlatform)) continue;

  const outfile = resolve(destDir, `promptcase-sidecar-${target.triple}${target.ext}`);
  console.log(`Building ${target.bun} -> ${outfile}`);

  try {
    execSync(
      `bun build --compile --minify --target ${target.bun} ${entrypoint} --outfile ${outfile}`,
      { stdio: "inherit" },
    );
    console.log(`  Done: ${target.triple}`);
  } catch (err) {
    console.error(`  Failed: ${target.triple}`);
    if (selectedPlatform) process.exit(1);
  }
}
