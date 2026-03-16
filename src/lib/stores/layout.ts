import { writable } from "svelte/store";
import { api } from "../ipc";

export const sidebarPosition = writable<"left" | "right">("left");

export async function initLayout(): Promise<void> {
  try {
    const config = await api.getConfig();
    const pos = config.sidebarPosition === "right" ? "right" : "left";
    sidebarPosition.set(pos);
  } catch {
    // use default
  }
}
