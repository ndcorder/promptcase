import App from "./App.svelte";
import { mount } from "svelte";
import "./app.css";
import { flushCommits, initCommitConfig } from "./lib/stores/commit";

initCommitConfig();

// Flush pending commits before the window closes
(async () => {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().onCloseRequested(async () => {
      await flushCommits();
    });
  } catch {
    // fallback for non-Tauri environments
  }
})();

// Disable browser context menu to feel native
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Block browser shortcuts that reveal web UI nature
document.addEventListener("keydown", (e) => {
  const isMeta = e.metaKey || e.ctrlKey;

  // Reload: Cmd+R, Cmd+Shift+R, F5
  if ((isMeta && e.key === "r") || e.key === "F5") {
    e.preventDefault();
  }

  // DevTools: Cmd+Option+I, Cmd+Shift+I, F12
  if (
    (isMeta && e.altKey && e.key === "i") ||
    (isMeta && e.shiftKey && e.key === "I") ||
    e.key === "F12"
  ) {
    e.preventDefault();
  }

  // View Source: Cmd+U
  if (isMeta && e.key === "u") {
    e.preventDefault();
  }

  // Cmd+Shift+C (element selector)
  if (isMeta && e.shiftKey && e.key === "C") {
    e.preventDefault();
  }
});

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
