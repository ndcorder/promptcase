import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename2 = fileURLToPath(import.meta.url);
const configPath = resolve(dirname(__filename2), "../src-tauri/tauri.conf.json");

describe("tauri.conf.json", () => {
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  it("is valid JSON with required top-level fields", () => {
    expect(config.productName).toBeDefined();
    expect(config.identifier).toBeDefined();
    expect(config.build).toBeDefined();
    expect(config.app).toBeDefined();
  });

  it("app section has no invalid top-level properties", () => {
    const allowed = ["windows", "security", "withGlobalTauri", "enableGTKAppId"];
    for (const key of Object.keys(config.app)) {
      expect(allowed).toContain(key);
    }
  });

  it("has a Content Security Policy set", () => {
    expect(config.app.security).toBeDefined();
    expect(config.app.security.csp).not.toBeNull();
    expect(typeof config.app.security.csp).toBe("string");
    expect(config.app.security.csp.length).toBeGreaterThan(0);
  });

  it("CSP restricts script-src", () => {
    const csp = config.app.security.csp as string;
    expect(csp).toContain("script-src");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("shell plugin has no scope in config (belongs in capabilities)", () => {
    const shell = config.plugins?.shell;
    expect(shell).toBeDefined();
    expect(shell.scope).toBeUndefined();
  });

  it("capabilities restrict sidecar args", () => {
    const capsPath = resolve(dirname(__filename2), "../src-tauri/capabilities/default.json");
    const caps = JSON.parse(readFileSync(capsPath, "utf-8"));
    for (const perm of caps.permissions) {
      if (typeof perm === "object" && perm.allow) {
        for (const entry of perm.allow) {
          if (entry.sidecar) {
            expect(entry.args).not.toBe(true);
          }
        }
      }
    }
  });

  it("windows have required properties", () => {
    expect(config.app.windows.length).toBeGreaterThan(0);
    for (const win of config.app.windows) {
      expect(win.title).toBeDefined();
      expect(win.width).toBeGreaterThan(0);
      expect(win.height).toBeGreaterThan(0);
    }
  });
});
