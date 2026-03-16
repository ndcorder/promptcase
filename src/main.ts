import App from "./App.svelte";
import { mount } from "svelte";
import "./app.css";
import { flushCommits, initCommitConfig } from "./lib/stores/commit";
import { initTheme } from "./lib/stores/theme";
import {
  initKeybindings,
  handleGlobalKeydown,
} from "./lib/stores/keybindings";

initCommitConfig();
initTheme();
initKeybindings();

// Flush pending commits before the window closes
(async () => {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await flushCommits();
      await appWindow.close();
    });
  } catch {
    // fallback for non-Tauri environments
  }
})();

// Disable browser context menu to feel native
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Block browser shortcuts and handle app keybindings
document.addEventListener("keydown", handleGlobalKeydown);

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
