import { writable } from "svelte/store";
import { api } from "../ipc";

export type Theme = "dark" | "light";

export const currentTheme = writable<Theme>("dark");

export async function setTheme(theme: Theme): Promise<void> {
  currentTheme.set(theme);
  document.documentElement.setAttribute("data-theme", theme);
  try {
    await api.updateConfig({ theme });
  } catch (err) {
    console.warn("Failed to persist theme:", err);
  }
}

export async function initTheme(): Promise<void> {
  try {
    const config = await api.getConfig();
    const theme: Theme = config.theme === "light" ? "light" : "dark";
    currentTheme.set(theme);
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const theme: Theme = prefersDark ? "dark" : "light";
    currentTheme.set(theme);
    document.documentElement.setAttribute("data-theme", theme);
  }
}
