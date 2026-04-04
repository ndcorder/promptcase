# Saved Search Filters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save tag + text filter combinations as "smart folders" for one-click access in the sidebar.

**Architecture:** Smart filters stored in `.promptcase.yaml` config. No new backend commands — uses existing config read/write. Frontend SmartFolders component in sidebar activates filters by setting existing stores.

**Tech Stack:** Rust (serde_yaml for config), Svelte 5, TypeScript

---

## Task 1: Backend — Config types

Add `SavedFilter` struct and wire it into `RepoConfig` so `.promptcase.yaml` can persist saved filters. Existing configs without the field deserialize cleanly via `serde(default)`.

**Files:**
- Modify: `src-tauri/src/types.rs` (add `SavedFilter` struct, add field to `RepoConfig`)

**Step 1: Add `SavedFilter` struct to `src-tauri/src/types.rs`**

Add before the `RepoConfig` struct (before line 176):

```rust
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedFilter {
    pub name: String,
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub icon: String,
}
```

**Step 2: Add `saved_filters` field to `RepoConfig`**

Add to the `RepoConfig` struct after the `keybindings` field (after line 208):

```rust
    // Saved search filters (smart folders)
    #[serde(default)]
    pub saved_filters: Vec<SavedFilter>,
```

**Step 3: Add to `Default` impl for `RepoConfig`**

Add to the `Default` impl's `Self { ... }` block (after `keybindings: HashMap::new(),` on line 240):

```rust
            saved_filters: Vec::new(),
```

**Step 4: Test deserialization**

Add test at the end of `src-tauri/src/config.rs` (inside the `#[cfg(test)]` module):

```rust
#[test]
fn test_saved_filters_deserialization() {
    let dir = tmp_dir();
    let yaml = r#"
version: 1
defaultModel: claude-sonnet-4
autoCommit: true
commitPrefix: "[promptcase]"
tokenCountModels: []
lintRules: {}
savedFilters:
  - name: "Production Claude"
    tag: "production"
    query: "claude"
    icon: "star"
  - name: "Draft Analysis"
    tag: "draft"
    query: "analysis"
"#;
    fs::write(dir.path().join(CONFIG_FILE), yaml).unwrap();
    let config = load_config(dir.path()).unwrap();
    assert_eq!(config.saved_filters.len(), 2);
    assert_eq!(config.saved_filters[0].name, "Production Claude");
    assert_eq!(config.saved_filters[0].tag, "production");
    assert_eq!(config.saved_filters[0].query, "claude");
    assert_eq!(config.saved_filters[0].icon, "star");
    assert_eq!(config.saved_filters[1].name, "Draft Analysis");
}

#[test]
fn test_saved_filters_missing_defaults_to_empty() {
    let dir = tmp_dir();
    let yaml = "version: 1\ndefaultModel: claude-sonnet-4\nautoCommit: true\ncommitPrefix: \"[pc]\"\ntokenCountModels: []\nlintRules: {}\n";
    fs::write(dir.path().join(CONFIG_FILE), yaml).unwrap();
    let config = load_config(dir.path()).unwrap();
    assert!(config.saved_filters.is_empty());
}

#[test]
fn test_saved_filters_roundtrip() {
    use crate::types::SavedFilter;
    let dir = tmp_dir();
    let mut config = RepoConfig::default();
    config.saved_filters = vec![
        SavedFilter {
            name: "Test Filter".into(),
            tag: "test".into(),
            query: "hello".into(),
            icon: "".into(),
        },
    ];
    save_config(dir.path(), &config).unwrap();
    let loaded = load_config(dir.path()).unwrap();
    assert_eq!(loaded.saved_filters.len(), 1);
    assert_eq!(loaded.saved_filters[0].name, "Test Filter");
    assert_eq!(loaded.saved_filters[0].tag, "test");
    assert_eq!(loaded.saved_filters[0].query, "hello");
}
```

**Verify:**

```bash
cd src-tauri && cargo test -- --nocapture test_saved_filters
```

**Commit:** `Add SavedFilter type to RepoConfig for persisting smart folder filters`

---

## Task 2: Frontend — Types and store

Add TypeScript types, `activeSavedFilter` store, and helper functions for CRUD operations through the existing config API.

**Files:**
- Modify: `src/lib/types.ts` (add `SavedFilter` interface, update `RepoConfig`)
- Modify: `src/lib/stores/files.ts` (add `activeSavedFilter` store)
- Create: `src/lib/stores/savedFilters.ts` (CRUD helpers)

**Step 1: Add `SavedFilter` interface to `src/lib/types.ts`**

Add after the `RepoStatus` interface (after line 112):

```typescript
export interface SavedFilter {
  name: string;
  tag: string;
  query: string;
  icon: string;
}
```

**Step 2: Add `savedFilters` to `RepoConfig` in `src/lib/types.ts`**

Add to the `RepoConfig` interface after `keybindings` (after line 104):

```typescript
  savedFilters: SavedFilter[];
```

**Step 3: Add `activeSavedFilter` store to `src/lib/stores/files.ts`**

Add import of `SavedFilter` to the existing import on line 2:

```typescript
import type { PromptEntry, FolderNode, SavedFilter } from "../types";
```

Add after `searchQuery` store (after line 11):

```typescript
export const activeSavedFilter = writable<SavedFilter | null>(null);
```

**Step 4: Create `src/lib/stores/savedFilters.ts`**

```typescript
import { get } from "svelte/store";
import { tagFilter, searchQuery, activeSavedFilter } from "./files";
import { api } from "../ipc";
import type { SavedFilter } from "../types";

/** Apply a saved filter — sets tagFilter, searchQuery, and marks it active */
export function applySavedFilter(filter: SavedFilter): void {
  tagFilter.set(filter.tag);
  searchQuery.set(filter.query);
  activeSavedFilter.set(filter);
}

/** Clear the active saved filter and reset search state */
export function clearSavedFilter(): void {
  tagFilter.set("");
  searchQuery.set("");
  activeSavedFilter.set(null);
}

/** Check if the current filter state matches a saved filter */
export function matchesSavedFilter(
  filter: SavedFilter,
  currentTag: string,
  currentQuery: string,
): boolean {
  return filter.tag === currentTag && filter.query === currentQuery;
}

/** Save a new filter to config */
export async function createSavedFilter(
  name: string,
  tag: string,
  query: string,
): Promise<SavedFilter[]> {
  const config = await api.getConfig();
  const filter: SavedFilter = { name, tag, query, icon: "" };
  const savedFilters = [...(config.savedFilters ?? []), filter];
  const updated = await api.updateConfig({ savedFilters });
  activeSavedFilter.set(filter);
  return updated.savedFilters;
}

/** Update an existing filter by index */
export async function updateSavedFilter(
  index: number,
  updates: Partial<SavedFilter>,
): Promise<SavedFilter[]> {
  const config = await api.getConfig();
  const savedFilters = [...(config.savedFilters ?? [])];
  if (index < 0 || index >= savedFilters.length) return savedFilters;
  savedFilters[index] = { ...savedFilters[index], ...updates };
  const updated = await api.updateConfig({ savedFilters });

  // If the updated filter is currently active, refresh active state
  const active = get(activeSavedFilter);
  if (active && active.name === config.savedFilters[index].name) {
    activeSavedFilter.set(savedFilters[index]);
  }
  return updated.savedFilters;
}

/** Delete a filter by index */
export async function deleteSavedFilter(
  index: number,
): Promise<SavedFilter[]> {
  const config = await api.getConfig();
  const savedFilters = [...(config.savedFilters ?? [])];
  const removed = savedFilters.splice(index, 1)[0];
  const updated = await api.updateConfig({ savedFilters });

  // If the deleted filter was active, clear it
  const active = get(activeSavedFilter);
  if (active && active.name === removed.name) {
    clearSavedFilter();
  }
  return updated.savedFilters;
}

/** Load saved filters from config */
export async function loadSavedFilters(): Promise<SavedFilter[]> {
  const config = await api.getConfig();
  return config.savedFilters ?? [];
}
```

**Verify:**

```bash
cd src-tauri && cargo test
npx tsc --noEmit
```

**Commit:** `Add SavedFilter TypeScript types and CRUD store helpers`

---

## Task 3: Frontend — SmartFolders component

Build the SmartFolders sidebar section: clickable filter rows with active highlighting, right-click context menu for edit/delete, and a "Save Current Filter" button that opens a name dialog.

**Files:**
- Create: `src/lib/components/SmartFolders.svelte`
- Create: `src/lib/components/SmartFolderContextMenu.svelte`

**Step 1: Create `src/lib/components/SmartFolderContextMenu.svelte`**

```svelte
<script lang="ts">
  interface Props {
    x: number;
    y: number;
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
  }

  let { x, y, onEdit, onDelete, onClose }: Props = $props();

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".context-menu")) {
      onClose();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div
  class="context-menu"
  style="left: {x}px; top: {y}px"
  role="menu"
>
  <button class="menu-item" role="menuitem" onclick={() => { onEdit(); onClose(); }}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Edit
  </button>
  <button class="menu-item danger" role="menuitem" onclick={() => { onDelete(); onClose(); }}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 3h8M4.5 3V2h3v1M3 3v7.5h6V3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Delete
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 140px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    padding: var(--space-1);
    box-shadow: var(--shadow-popover);
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    text-align: left;
    transition: all var(--transition-fast);
  }
  .menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }
  .menu-item.danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger);
  }
</style>
```

**Step 2: Create `src/lib/components/SmartFolders.svelte`**

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { tagFilter, searchQuery, activeSavedFilter } from "../stores/files";
  import {
    applySavedFilter,
    clearSavedFilter,
    createSavedFilter,
    updateSavedFilter,
    deleteSavedFilter,
    loadSavedFilters,
    matchesSavedFilter,
  } from "../stores/savedFilters";
  import SmartFolderContextMenu from "./SmartFolderContextMenu.svelte";
  import InputDialog from "./InputDialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import type { SavedFilter } from "../types";

  let filters = $state<SavedFilter[]>([]);
  let contextMenu = $state<{ index: number; x: number; y: number } | null>(null);

  // Save dialog
  let saveDialogVisible = $state(false);

  // Edit dialog
  let editDialogVisible = $state(false);
  let editIndex = $state(-1);
  let editDefault = $state("");

  // Delete confirm
  let deleteConfirmVisible = $state(false);
  let deleteIndex = $state(-1);

  // Track whether a filter is currently active (tag or search has a value)
  let hasActiveFilter = $derived(!!$tagFilter || !!$searchQuery);

  // Track whether current filter state is already saved
  let currentFilterAlreadySaved = $derived(
    filters.some((f) => matchesSavedFilter(f, $tagFilter, $searchQuery)),
  );

  // Show save button only when there's an active filter that isn't already saved
  let showSaveButton = $derived(hasActiveFilter && !currentFilterAlreadySaved);

  onMount(async () => {
    filters = await loadSavedFilters();
  });

  // Deactivate saved filter when stores change externally
  $effect(() => {
    const active = $activeSavedFilter;
    if (active && !matchesSavedFilter(active, $tagFilter, $searchQuery)) {
      activeSavedFilter.set(null);
    }
  });

  function handleClick(filter: SavedFilter) {
    // If already active, deactivate
    if ($activeSavedFilter?.name === filter.name) {
      clearSavedFilter();
    } else {
      applySavedFilter(filter);
    }
  }

  function handleContext(index: number, e: MouseEvent) {
    e.preventDefault();
    contextMenu = { index, x: e.clientX, y: e.clientY };
  }

  function handleEdit() {
    if (contextMenu === null) return;
    editIndex = contextMenu.index;
    editDefault = filters[editIndex].name;
    contextMenu = null;
    editDialogVisible = true;
  }

  function handleDeleteRequest() {
    if (contextMenu === null) return;
    deleteIndex = contextMenu.index;
    contextMenu = null;
    deleteConfirmVisible = true;
  }

  async function handleSave(name: string) {
    saveDialogVisible = false;
    const n = name.trim();
    if (!n) return;
    filters = await createSavedFilter(n, $tagFilter, $searchQuery);
  }

  async function handleEditConfirm(name: string) {
    editDialogVisible = false;
    const n = name.trim();
    if (!n || editIndex < 0) return;
    filters = await updateSavedFilter(editIndex, { name: n });
  }

  async function handleDeleteConfirm() {
    deleteConfirmVisible = false;
    if (deleteIndex < 0) return;
    filters = await deleteSavedFilter(deleteIndex);
    deleteIndex = -1;
  }
</script>

{#if filters.length > 0 || showSaveButton}
  <div class="smart-folders">
    {#if filters.length > 0}
      <div class="smart-folders-list">
        {#each filters as filter, index}
          <button
            class="smart-folder-item"
            class:active={$activeSavedFilter?.name === filter.name}
            onclick={() => handleClick(filter)}
            oncontextmenu={(e) => handleContext(index, e)}
            title="{filter.tag ? `tag: ${filter.tag}` : ''}{filter.tag && filter.query ? ' + ' : ''}{filter.query ? `search: ${filter.query}` : ''}"
          >
            <svg class="filter-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 2h10L7.5 6.5V10L4.5 11V6.5L1 2z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="filter-name">{filter.name}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if showSaveButton}
      <button class="save-filter-btn" onclick={() => { saveDialogVisible = true; }}>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Save current filter
      </button>
    {/if}
  </div>
{/if}

{#if contextMenu}
  <SmartFolderContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onEdit={handleEdit}
    onDelete={handleDeleteRequest}
    onClose={() => { contextMenu = null; }}
  />
{/if}

<InputDialog
  visible={saveDialogVisible}
  title="Save Filter"
  placeholder="Filter name..."
  defaultValue=""
  onConfirm={handleSave}
  onCancel={() => { saveDialogVisible = false; }}
/>

<InputDialog
  visible={editDialogVisible}
  title="Rename Filter"
  placeholder="Filter name..."
  defaultValue={editDefault}
  onConfirm={handleEditConfirm}
  onCancel={() => { editDialogVisible = false; }}
/>

<ConfirmDialog
  visible={deleteConfirmVisible}
  title="Delete Filter"
  message={deleteIndex >= 0 && deleteIndex < filters.length
    ? `Delete saved filter "${filters[deleteIndex].name}"?`
    : "Delete this filter?"}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={handleDeleteConfirm}
  onCancel={() => { deleteConfirmVisible = false; }}
/>

<style>
  .smart-folders {
    padding: 0 var(--space-2) var(--space-1);
  }
  .smart-folders-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .smart-folder-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    text-align: left;
    transition: all var(--transition-fast);
  }
  .smart-folder-item:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
  .smart-folder-item.active {
    background: var(--accent-subtle);
    color: var(--accent);
  }
  .smart-folder-item.active .filter-icon {
    color: var(--accent);
  }
  .filter-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }
  .filter-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .save-filter-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    margin-top: var(--space-1);
    color: var(--text-tertiary);
    font-size: var(--font-size-xs, 11px);
    border-radius: var(--radius-sm);
    text-align: left;
    transition: all var(--transition-fast);
  }
  .save-filter-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary);
  }
</style>
```

**Verify:**

```bash
npx tsc --noEmit
```

**Commit:** `Add SmartFolders component with save/edit/delete and active highlighting`

---

## Task 4: Frontend — Integration

Place SmartFolders in the Sidebar layout, sync active state when TagFilter or search changes externally, and clear saved filter highlight when stores are modified directly.

**Files:**
- Modify: `src/lib/components/Sidebar.svelte` (import and place SmartFolders, sync searchValue)

**Step 1: Add SmartFolders import to `src/lib/components/Sidebar.svelte`**

Add after the existing imports (after line 8, where `MoveToFolderDialog` is imported):

```typescript
  import SmartFolders from "./SmartFolders.svelte";
```

**Step 2: Place SmartFolders in sidebar template**

The sidebar layout currently has this order (lines 353-376):
1. `<TagFilter />` (line 355)
2. `.sidebar-search` div (lines 357-376)
3. `.tree-container` div (lines 378-428)

Insert `<SmartFolders />` between `<TagFilter />` and the search input. After `<TagFilter />` on line 355, add:

```svelte

  <SmartFolders />
```

So lines 355-358 become:

```svelte
  <TagFilter />

  <SmartFolders />

  <div class="sidebar-search">
```

**Step 3: Sync searchValue with activeSavedFilter**

The sidebar has a local `searchValue` state (line 42) that is synced to the `searchQuery` store via `$effect` (lines 44-46). When a saved filter is applied, the `searchQuery` store updates but `searchValue` does not.

Replace the search sync effect (lines 42-46):

```typescript
  let searchValue = $state("");

  $effect(() => {
    searchQuery.set(searchValue);
  });
```

With a bidirectional sync:

```typescript
  let searchValue = $state("");
  let searchSyncedFromStore = false;

  // When user types, push to store
  $effect(() => {
    if (!searchSyncedFromStore) {
      searchQuery.set(searchValue);
    }
    searchSyncedFromStore = false;
  });

  // When store changes externally (e.g., saved filter applied), pull to local
  $effect(() => {
    const storeValue = $searchQuery;
    if (storeValue !== searchValue) {
      searchSyncedFromStore = true;
      searchValue = storeValue;
    }
  });
```

Note: The `$searchQuery` reactive subscription in the second `$effect` triggers whenever the store changes (from `applySavedFilter` or `clearSavedFilter`), which updates the local `searchValue` to keep the search input in sync.

**Verify:**

```bash
npx tsc --noEmit
npm run build
```

Test the full flow manually:
1. Set a tag filter via TagFilter chips and type a search query
2. "Save current filter" button should appear in the smart folders section
3. Click it, enter a name, confirm — filter appears in the list
4. Clear the filters, then click the saved filter — tag and search should restore
5. Click the active saved filter again — filters should clear
6. Right-click a saved filter — Edit and Delete options appear
7. Rename via Edit, confirm deletion via Delete
8. Saved filters persist across app restart (stored in `.promptcase.yaml`)

**Commit:** `Integrate SmartFolders into sidebar with bidirectional search sync`
