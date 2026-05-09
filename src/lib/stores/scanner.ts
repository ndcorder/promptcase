import { writable } from "svelte/store";
import type { ScannedPrompt } from "../types";

export const scanResults = writable<ScannedPrompt[]>([]);
