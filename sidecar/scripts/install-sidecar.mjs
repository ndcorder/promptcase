#!/usr/bin/env node
/**
 * Copies the compiled sidecar binary to src-tauri/binaries/
 * with the correct target-triple suffix that Tauri expects.
 *
 * Usage: node scripts/install-sidecar.mjs
 */
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ext = process.platform === "win32" ? ".exe" : "";
const targetTriple = execSync("rustc --print host-tuple", { encoding: "utf-8" }).trim();

const src = resolve(import.meta.dirname, "..", `promptcase-sidecar${ext}`);
const destDir = resolve(import.meta.dirname, "..", "..", "src-tauri", "binaries");
const dest = resolve(destDir, `promptcase-sidecar-${targetTriple}${ext}`);

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

console.log(`Installed sidecar: ${dest}`);
