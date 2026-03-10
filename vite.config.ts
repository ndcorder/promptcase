import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            "codemirror",
            "@codemirror/autocomplete",
            "@codemirror/commands",
            "@codemirror/lang-markdown",
            "@codemirror/lang-yaml",
            "@codemirror/language",
            "@codemirror/merge",
            "@codemirror/search",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/highlight",
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
