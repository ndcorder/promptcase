import { writable, get } from "svelte/store";
import type { CompareState, CompareVersion } from "../types";
import { api } from "../ipc";
import { activeFile, editorContent } from "./editor";
import { addToast } from "./toast";

const initialState: CompareState = {
  visible: false,
  path: null,
  versionA: null,
  versionB: null,
};

export const compareState = writable<CompareState>(initialState);

/** Whether the user is in "select two commits" mode. */
export const compareSelectionMode = writable(false);

/** Commits selected so far (max 2). */
export const selectedCommits = writable<string[]>([]);

/**
 * Open the compare overlay showing versionA (old) vs versionB (new).
 * If commitB is omitted, the current editor content is used.
 */
export async function openCompare(
  commitA: string,
  labelA: string,
  commitB?: string,
  labelB?: string,
): Promise<void> {
  const file = get(activeFile);
  if (!file) return;

  try {
    const contentA = await api.gitShowFile(file.path, commitA);

    let contentB: string;
    let finalLabelB: string;
    if (commitB) {
      contentB = await api.gitShowFile(file.path, commitB);
      finalLabelB = labelB ?? commitB.slice(0, 7);
    } else {
      contentB = get(editorContent);
      finalLabelB = labelB ?? "Current";
    }

    compareState.set({
      visible: true,
      path: file.path,
      versionA: { label: labelA, commit: commitA, content: contentA },
      versionB: { label: finalLabelB, commit: commitB ?? "working", content: contentB },
    });
  } catch (err) {
    console.error("Failed to load version for comparison:", err);
    addToast("Failed to load version", "error");
  }
}

export function closeCompare(): void {
  compareState.set(initialState);
  compareSelectionMode.set(false);
  selectedCommits.set([]);
}

/**
 * Toggle a commit in the A/B selection. When two are selected,
 * automatically open the comparison (older commit as A).
 */
export async function toggleCommitSelection(commit: string): Promise<void> {
  const current = get(selectedCommits);
  if (current.includes(commit)) {
    selectedCommits.set(current.filter((c) => c !== commit));
    return;
  }

  const next = [...current, commit];
  if (next.length === 2) {
    // Open compare with the two selected commits (chronological order: older = A)
    const [first, second] = next;
    await openCompare(
      first,
      first.slice(0, 7),
      second,
      second.slice(0, 7),
    );
    compareSelectionMode.set(false);
    selectedCommits.set([]);
  } else {
    selectedCommits.set(next);
  }
}
