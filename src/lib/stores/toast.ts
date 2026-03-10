import { writable } from "svelte/store";

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
  timeout?: number;
}

export const toasts = writable<Toast[]>([]);

let counter = 0;

export function addToast(
  message: string,
  type: Toast["type"],
  timeout = 5000,
): string {
  const id = `toast-${++counter}-${Date.now()}`;
  const toast: Toast = { id, message, type, timeout };
  toasts.update((t) => [...t, toast]);

  if (timeout > 0) {
    setTimeout(() => removeToast(id), timeout);
  }

  return id;
}

export function removeToast(id: string): void {
  toasts.update((t) => t.filter((toast) => toast.id !== id));
}
