import { api } from "../ipc";

const DEFAULTS: Record<string, string> = {
  save: "Cmd+S",
  openQuickOpen: "Cmd+P",
  openCommandPalette: "Cmd+Shift+P",
  toggleSidebar: "Cmd+B",
  toggleBottomPanel: "Cmd+J",
  togglePreview: "Cmd+E",
  closeTab: "Cmd+W",
  openSettings: "Cmd+,",
  switchTab1: "Cmd+1",
  switchTab2: "Cmd+2",
  switchTab3: "Cmd+3",
  switchTab4: "Cmd+4",
  switchTab5: "Cmd+5",
  switchTab6: "Cmd+6",
  switchTab7: "Cmd+7",
  switchTab8: "Cmd+8",
  switchTab9: "Cmd+9",
};

let bindings: Record<string, string> = { ...DEFAULTS };
let actionHandlers: Record<string, () => void> = {};

export async function initKeybindings(): Promise<void> {
  try {
    const config = await api.getConfig();
    if (config.keybindings) {
      bindings = { ...DEFAULTS, ...config.keybindings };
    }
  } catch {
    // use defaults
  }
}

export function registerAction(action: string, handler: () => void): void {
  actionHandlers[action] = handler;
}

export function getShortcut(action: string): string {
  return bindings[action] || "";
}

export function getAllShortcuts(): Array<{
  action: string;
  shortcut: string;
}> {
  return Object.entries(bindings).map(([action, shortcut]) => ({
    action,
    shortcut,
  }));
}

function matchesEvent(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needsMeta = parts.includes("cmd") || parts.includes("meta");
  const needsCtrl = parts.includes("ctrl");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt") || parts.includes("option");

  const isMac = navigator.platform.includes("Mac");
  const metaMatch = isMac
    ? e.metaKey === needsMeta
    : e.ctrlKey === (needsMeta || needsCtrl);

  return (
    metaMatch &&
    e.shiftKey === needsShift &&
    e.altKey === needsAlt &&
    e.key.toLowerCase() === key
  );
}

export function handleGlobalKeydown(e: KeyboardEvent): void {
  // Block browser shortcuts that reveal web UI nature
  const isMeta = e.metaKey || e.ctrlKey;
  if ((isMeta && e.key === "r") || e.key === "F5") {
    e.preventDefault();
    return;
  }
  if (
    (isMeta && e.altKey && e.key === "i") ||
    (isMeta && e.shiftKey && e.key === "I") ||
    e.key === "F12"
  ) {
    e.preventDefault();
    return;
  }
  if (isMeta && e.key === "u") {
    e.preventDefault();
    return;
  }
  if (isMeta && e.shiftKey && e.key === "C") {
    e.preventDefault();
    return;
  }

  // Match against registered bindings
  for (const [action, shortcut] of Object.entries(bindings)) {
    if (matchesEvent(shortcut, e)) {
      e.preventDefault();
      actionHandlers[action]?.();
      return;
    }
  }
}
