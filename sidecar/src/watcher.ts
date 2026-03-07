// TODO: Integrate FileWatcher with RpcHandler to detect external file changes
import { watch, type FSWatcher } from "chokidar";
import { extname } from "node:path";

export type WatchEvent = "add" | "change" | "unlink";
export type WatchCallback = (event: WatchEvent, path: string) => void;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private repoRoot: string;
  private callbacks: WatchCallback[] = [];

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.repoRoot, {
      ignored: [
        /(^|[/\\])\./,
        "**/node_modules/**",
        "**/.git/**",
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on("add", (path) => {
      if (this.isPromptFile(path)) this.notify("add", path);
    });

    this.watcher.on("change", (path) => {
      if (this.isPromptFile(path)) this.notify("change", path);
    });

    this.watcher.on("unlink", (path) => {
      if (this.isPromptFile(path)) this.notify("unlink", path);
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  onFileChange(callback: WatchCallback): void {
    this.callbacks.push(callback);
  }

  private notify(event: WatchEvent, path: string): void {
    for (const cb of this.callbacks) {
      cb(event, path);
    }
  }

  private isPromptFile(path: string): boolean {
    return extname(path) === ".md";
  }
}
