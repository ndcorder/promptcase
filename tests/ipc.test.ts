import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the real src/lib/ipc.ts module, mocking only the Tauri invoke bridge.

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

describe("ipc", () => {
  // --- isTauri ---------------------------------------------------------

  describe("isTauri", () => {
    afterEach(() => {
      delete (window as any).__TAURI_INTERNALS__;
    });

    it("returns false when __TAURI_INTERNALS__ is absent", async () => {
      delete (window as any).__TAURI_INTERNALS__;
      const { isTauri } = await import("../src/lib/ipc");
      expect(isTauri()).toBe(false);
    });

    it("returns true when __TAURI_INTERNALS__ is present", async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      const { isTauri } = await import("../src/lib/ipc");
      expect(isTauri()).toBe(true);
    });
  });

  // --- ensureTauri (tested via api calls) ------------------------------

  describe("ensureTauri guard", () => {
    afterEach(() => {
      delete (window as any).__TAURI_INTERNALS__;
    });

    it("throws when Tauri runtime is not available", async () => {
      delete (window as any).__TAURI_INTERNALS__;
      const { api } = await import("../src/lib/ipc");
      await expect(api.listFiles()).rejects.toThrow(
        "Tauri runtime not available",
      );
    });
  });

  // --- api methods (with Tauri env active) -----------------------------

  describe("api methods", () => {
    beforeEach(() => {
      (window as any).__TAURI_INTERNALS__ = {};
      mockInvoke.mockReset();
    });

    afterEach(() => {
      delete (window as any).__TAURI_INTERNALS__;
    });

    // No-arg methods
    it("listTags — no args", async () => {
      mockInvoke.mockResolvedValue([{ name: "test", count: 1 }]);
      const { api } = await import("../src/lib/ipc");
      const result = await api.listTags();
      expect(mockInvoke).toHaveBeenCalledWith("list_tags", undefined);
      expect(result).toEqual([{ name: "test", count: 1 }]);
    });

    it("listFiles — no args", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.listFiles();
      expect(mockInvoke).toHaveBeenCalledWith("list_files", undefined);
    });

    it("listFolders — no args", async () => {
      mockInvoke.mockResolvedValue(["folder1"]);
      const { api } = await import("../src/lib/ipc");
      await api.listFolders();
      expect(mockInvoke).toHaveBeenCalledWith("list_folders", undefined);
    });

    it("gitStatus — no args", async () => {
      mockInvoke.mockResolvedValue({ initialized: true, clean: true });
      const { api } = await import("../src/lib/ipc");
      await api.gitStatus();
      expect(mockInvoke).toHaveBeenCalledWith("git_status", undefined);
    });

    it("lintAll — no args", async () => {
      mockInvoke.mockResolvedValue({});
      const { api } = await import("../src/lib/ipc");
      await api.lintAll();
      expect(mockInvoke).toHaveBeenCalledWith("lint_all", undefined);
    });

    it("reindex — no args", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.reindex();
      expect(mockInvoke).toHaveBeenCalledWith("search_reindex", undefined);
    });

    it("getConfig — no args", async () => {
      mockInvoke.mockResolvedValue({ version: 1 });
      const { api } = await import("../src/lib/ipc");
      await api.getConfig();
      expect(mockInvoke).toHaveBeenCalledWith("get_config", undefined);
    });

    it("cancelPrompt — no args", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.cancelPrompt();
      expect(mockInvoke).toHaveBeenCalledWith("cancel_prompt", undefined);
    });

    it("startWatcher — no args", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.startWatcher();
      expect(mockInvoke).toHaveBeenCalledWith("start_watcher", undefined);
    });

    it("stopWatcher — no args", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.stopWatcher();
      expect(mockInvoke).toHaveBeenCalledWith("stop_watcher", undefined);
    });

    it("installSamples — no args", async () => {
      mockInvoke.mockResolvedValue("done");
      const { api } = await import("../src/lib/ipc");
      await api.installSamples();
      expect(mockInvoke).toHaveBeenCalledWith("install_samples", undefined);
    });

    it("loadRecovery — no args", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.loadRecovery();
      expect(mockInvoke).toHaveBeenCalledWith("load_recovery", undefined);
    });

    it("clearAllRecovery — no args", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.clearAllRecovery();
      expect(mockInvoke).toHaveBeenCalledWith("clear_all_recovery", undefined);
    });

    // Single path arg
    it("readFile — path arg", async () => {
      mockInvoke.mockResolvedValue({ path: "a.md", body: "" });
      const { api } = await import("../src/lib/ipc");
      await api.readFile("a.md");
      expect(mockInvoke).toHaveBeenCalledWith("read_file", { path: "a.md" });
    });

    it("deleteFile — path arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.deleteFile("x.md");
      expect(mockInvoke).toHaveBeenCalledWith("delete_file", { path: "x.md" });
    });

    it("createFolder — path arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.createFolder("new-dir");
      expect(mockInvoke).toHaveBeenCalledWith("create_folder", { path: "new-dir" });
    });

    it("deleteFolder — path arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.deleteFolder("old-dir");
      expect(mockInvoke).toHaveBeenCalledWith("delete_folder", { path: "old-dir" });
    });

    it("duplicateFile — path arg", async () => {
      mockInvoke.mockResolvedValue({ path: "a-copy.md" });
      const { api } = await import("../src/lib/ipc");
      await api.duplicateFile("a.md");
      expect(mockInvoke).toHaveBeenCalledWith("duplicate_file", { path: "a.md" });
    });

    it("lintFile — path arg", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.lintFile("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("lint_file", { path: "f.md" });
    });

    it("getVariables — path arg", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.getVariables("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("get_variables", { path: "f.md" });
    });

    it("generateCommitMessage — path arg", async () => {
      mockInvoke.mockResolvedValue("feat: change");
      const { api } = await import("../src/lib/ipc");
      await api.generateCommitMessage("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("generate_commit_message", { path: "f.md" });
    });

    it("markFileWriting — path arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.markFileWriting("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("mark_file_writing", { path: "f.md" });
    });

    it("unmarkFileWriting — path arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.unmarkFileWriting("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("unmark_file_writing", { path: "f.md" });
    });

    it("clearRecovery — path arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.clearRecovery("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("clear_recovery", { path: "f.md" });
    });

    it("scanDirectory — path arg", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.scanDirectory("/some/path");
      expect(mockInvoke).toHaveBeenCalledWith("scan_directory", { path: "/some/path" });
    });

    // Multiple args
    it("writeFile — path + optional frontmatter + body", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.writeFile("a.md", { title: "x" }, "body text");
      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "a.md",
        frontmatter: { title: "x" },
        body: "body text",
      });
    });

    it("writeFile — optional args omitted are undefined", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.writeFile("a.md");
      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "a.md",
        frontmatter: undefined,
        body: undefined,
      });
    });

    it("createFile — with default type", async () => {
      mockInvoke.mockResolvedValue({ path: "a.md" });
      const { api } = await import("../src/lib/ipc");
      await api.createFile("dir/", "My Title");
      expect(mockInvoke).toHaveBeenCalledWith("create_file", {
        path: "dir/",
        title: "My Title",
        prompt_type: "prompt",
        template: undefined,
      });
    });

    it("createFile — with explicit type and template", async () => {
      mockInvoke.mockResolvedValue({ path: "a.md" });
      const { api } = await import("../src/lib/ipc");
      await api.createFile("dir/", "Frag", "fragment", "tmpl");
      expect(mockInvoke).toHaveBeenCalledWith("create_file", {
        path: "dir/",
        title: "Frag",
        prompt_type: "fragment",
        template: "tmpl",
      });
    });

    it("moveFile — from/to", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.moveFile("old.md", "new.md");
      expect(mockInvoke).toHaveBeenCalledWith("move_file", { from: "old.md", to: "new.md" });
    });

    it("renameFolder — from/to", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.renameFolder("old", "new");
      expect(mockInvoke).toHaveBeenCalledWith("rename_folder", { from: "old", to: "new" });
    });

    it("moveFiles — paths + destination", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.moveFiles(["a.md", "b.md"], "dest/");
      expect(mockInvoke).toHaveBeenCalledWith("move_files", {
        paths: ["a.md", "b.md"],
        destination: "dest/",
      });
    });

    // Renamed args (snake_case mapping)
    it("renameTag — old_name/new_name mapping", async () => {
      mockInvoke.mockResolvedValue(3);
      const { api } = await import("../src/lib/ipc");
      await api.renameTag("old", "new");
      expect(mockInvoke).toHaveBeenCalledWith("rename_tag", {
        old_name: "old",
        new_name: "new",
      });
    });

    it("deleteTag — tag_name mapping", async () => {
      mockInvoke.mockResolvedValue(2);
      const { api } = await import("../src/lib/ipc");
      await api.deleteTag("stale");
      expect(mockInvoke).toHaveBeenCalledWith("delete_tag", { tag_name: "stale" });
    });

    it("mergeTags — source_tags/target_tag mapping", async () => {
      mockInvoke.mockResolvedValue(5);
      const { api } = await import("../src/lib/ipc");
      await api.mergeTags(["a", "b"], "c");
      expect(mockInvoke).toHaveBeenCalledWith("merge_tags", {
        source_tags: ["a", "b"],
        target_tag: "c",
      });
    });

    it("gitDiff — commit_a/commit_b mapping", async () => {
      mockInvoke.mockResolvedValue({ raw: "diff" });
      const { api } = await import("../src/lib/ipc");
      await api.gitDiff("file.md", "abc", "def");
      expect(mockInvoke).toHaveBeenCalledWith("git_diff", {
        path: "file.md",
        commit_a: "abc",
        commit_b: "def",
      });
    });

    // Optional args
    it("gitLog — optional path and limit", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.gitLog("f.md", 10);
      expect(mockInvoke).toHaveBeenCalledWith("git_log", { path: "f.md", limit: 10 });
    });

    it("gitLog — args omitted", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.gitLog();
      expect(mockInvoke).toHaveBeenCalledWith("git_log", {
        path: undefined,
        limit: undefined,
      });
    });

    it("gitRestore — path + commit", async () => {
      mockInvoke.mockResolvedValue("restored content");
      const { api } = await import("../src/lib/ipc");
      await api.gitRestore("f.md", "abc");
      expect(mockInvoke).toHaveBeenCalledWith("git_restore", { path: "f.md", commit: "abc" });
    });

    it("gitShowFile — path + commit", async () => {
      mockInvoke.mockResolvedValue("file content");
      const { api } = await import("../src/lib/ipc");
      await api.gitShowFile("f.md", "abc");
      expect(mockInvoke).toHaveBeenCalledWith("git_show_file", { path: "f.md", commit: "abc" });
    });

    it("resolveTemplate — with variables", async () => {
      mockInvoke.mockResolvedValue({ text: "hi" });
      const { api } = await import("../src/lib/ipc");
      await api.resolveTemplate("f.md", { name: "val" });
      expect(mockInvoke).toHaveBeenCalledWith("resolve_template", {
        path: "f.md",
        variables: { name: "val" },
      });
    });

    it("resolveTemplate — without variables", async () => {
      mockInvoke.mockResolvedValue({ text: "hi" });
      const { api } = await import("../src/lib/ipc");
      await api.resolveTemplate("f.md");
      expect(mockInvoke).toHaveBeenCalledWith("resolve_template", {
        path: "f.md",
        variables: undefined,
      });
    });

    it("countTokens — text + model", async () => {
      mockInvoke.mockResolvedValue(42);
      const { api } = await import("../src/lib/ipc");
      await api.countTokens("hello world", "gpt-4");
      expect(mockInvoke).toHaveBeenCalledWith("count_tokens", {
        text: "hello world",
        model: "gpt-4",
      });
    });

    it("countTokensResolved — with optional variables", async () => {
      mockInvoke.mockResolvedValue(100);
      const { api } = await import("../src/lib/ipc");
      await api.countTokensResolved("f.md", "gpt-4", { x: "y" });
      expect(mockInvoke).toHaveBeenCalledWith("count_tokens_resolved", {
        path: "f.md",
        model: "gpt-4",
        variables: { x: "y" },
      });
    });

    it("search — q + optional filters", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.search("hello", { tag: "work" });
      expect(mockInvoke).toHaveBeenCalledWith("search_query", {
        q: "hello",
        filters: { tag: "work" },
      });
    });

    it("updateConfig — updates arg", async () => {
      mockInvoke.mockResolvedValue({ version: 1 });
      const { api } = await import("../src/lib/ipc");
      await api.updateConfig({ autoCommit: false });
      expect(mockInvoke).toHaveBeenCalledWith("update_config", {
        updates: { autoCommit: false },
      });
    });

    it("commitFile — path + message", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.commitFile("f.md", "fix: typo");
      expect(mockInvoke).toHaveBeenCalledWith("commit_file", {
        path: "f.md",
        message: "fix: typo",
      });
    });

    it("getApiKey — provider arg", async () => {
      mockInvoke.mockResolvedValue("sk-123");
      const { api } = await import("../src/lib/ipc");
      await api.getApiKey("openai");
      expect(mockInvoke).toHaveBeenCalledWith("get_api_key", { provider: "openai" });
    });

    it("setApiKey — provider + key", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.setApiKey("openai", "sk-456");
      expect(mockInvoke).toHaveBeenCalledWith("set_api_key", {
        provider: "openai",
        key: "sk-456",
      });
    });

    it("deleteApiKey — provider arg", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.deleteApiKey("openai");
      expect(mockInvoke).toHaveBeenCalledWith("delete_api_key", { provider: "openai" });
    });

    it("runPrompt — request object passed as-is", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      const req = {
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.7,
        maxTokens: 100,
      };
      await api.runPrompt(req);
      expect(mockInvoke).toHaveBeenCalledWith("run_prompt", { request: req });
    });

    // runEval — remapped arg name (maxTokens -> max_tokens)
    it("runEval — max_tokens remapping", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.runEval("f.md", "anthropic", "claude", 0.5, 2048);
      expect(mockInvoke).toHaveBeenCalledWith("run_eval", {
        path: "f.md",
        provider: "anthropic",
        model: "claude",
        temperature: 0.5,
        max_tokens: 2048,
      });
    });

    // Export
    it("exportFileClipboard — path + format", async () => {
      mockInvoke.mockResolvedValue("content");
      const { api } = await import("../src/lib/ipc");
      await api.exportFileClipboard("f.md", "resolved");
      expect(mockInvoke).toHaveBeenCalledWith("export_file_clipboard", {
        path: "f.md",
        format: "resolved",
      });
    });

    // exportFolderZip — nullish coalescing on outputPath
    it("exportFolderZip — with outputPath", async () => {
      mockInvoke.mockResolvedValue([1, 2, 3]);
      const { api } = await import("../src/lib/ipc");
      await api.exportFolderZip("dir/", "/tmp/out.zip");
      expect(mockInvoke).toHaveBeenCalledWith("export_folder_zip", {
        folder: "dir/",
        outputPath: "/tmp/out.zip",
      });
    });

    it("exportFolderZip — without outputPath defaults to null", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.exportFolderZip("dir/");
      expect(mockInvoke).toHaveBeenCalledWith("export_folder_zip", {
        folder: "dir/",
        outputPath: null,
      });
    });

    // Import
    it("importFiles — paths + destination", async () => {
      mockInvoke.mockResolvedValue([]);
      const { api } = await import("../src/lib/ipc");
      await api.importFiles(["/a.md"], "dest/");
      expect(mockInvoke).toHaveBeenCalledWith("import_files", {
        paths: ["/a.md"],
        destination: "dest/",
      });
    });

    it("importFromText — title + text + destination", async () => {
      mockInvoke.mockResolvedValue({ path: "dest/new.md" });
      const { api } = await import("../src/lib/ipc");
      await api.importFromText("Title", "body", "dest/");
      expect(mockInvoke).toHaveBeenCalledWith("import_from_text", {
        title: "Title",
        text: "body",
        destination: "dest/",
      });
    });

    // Recovery
    it("saveRecovery — path + content", async () => {
      mockInvoke.mockResolvedValue({ ok: true });
      const { api } = await import("../src/lib/ipc");
      await api.saveRecovery("f.md", "draft");
      expect(mockInvoke).toHaveBeenCalledWith("save_recovery", {
        path: "f.md",
        content: "draft",
      });
    });
  });
});
