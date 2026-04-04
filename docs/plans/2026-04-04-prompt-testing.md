# Prompt Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run prompts against LLM APIs directly from the editor with streaming responses, variable substitution, and model selection.

**Architecture:** Rust backend makes HTTP calls to LLM APIs (Anthropic, OpenAI) with streaming via Tauri events. API keys stored in OS keychain. Frontend TestPanel shows real-time response with controls for model, temperature, and max tokens.

**Tech Stack:** Rust (reqwest, keyring, serde_json), Tauri v2 events, Svelte 5, TypeScript

---

### Task 1: Backend — LLM types and keyring

Add the foundational types, dependencies, and API key management commands.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/types.rs`
- Create: `src-tauri/src/llm.rs`
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add dependencies to Cargo.toml**

```toml
# Add to [dependencies] section:
reqwest = { version = "0.12", features = ["json", "stream"] }
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
tokio-stream = "0.1"
futures-util = "0.3"
```

Run: `cd src-tauri && cargo check`
Expected: compiles (deps download, no code uses them yet).

**Step 2: Add LLM types to types.rs**

Append after `RepoStatus`:

```rust
// ---------------------------------------------------------------------------
// LLM / Prompt Testing
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LlmMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LlmResponse {
    pub content: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub model: String,
    pub duration_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunPromptRequest {
    pub provider: String,
    pub model: String,
    pub messages: Vec<LlmMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f64>,
}

/// Payload emitted as `prompt-response-chunk` Tauri event.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptChunkPayload {
    pub request_id: String,
    pub delta: String,
}

/// Payload emitted as `prompt-response-done` Tauri event.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptDonePayload {
    pub request_id: String,
    pub content: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub model: String,
    pub duration_ms: u64,
}

/// Payload emitted as `prompt-response-error` Tauri event.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptErrorPayload {
    pub request_id: String,
    pub error: String,
}
```

**Step 3: Add Reqwest error variant to error.rs**

```rust
// Add variant to AppError enum:
#[error("{0}")]
Reqwest(#[from] reqwest::Error),
```

**Step 4: Create llm.rs module with keyring helpers**

Create `src-tauri/src/llm.rs`:

```rust
use crate::error::AppError;

const KEYRING_SERVICE: &str = "com.promptcase.api-keys";

/// Retrieve an API key for the given provider from the OS keychain.
pub fn get_api_key(provider: &str) -> Result<Option<String>, AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| AppError::Custom(format!("Keyring error: {e}")))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Custom(format!("Keyring error: {e}"))),
    }
}

/// Store an API key for the given provider in the OS keychain.
pub fn set_api_key(provider: &str, key: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| AppError::Custom(format!("Keyring error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| AppError::Custom(format!("Keyring error: {e}")))
}

/// Delete an API key for the given provider from the OS keychain.
pub fn delete_api_key(provider: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| AppError::Custom(format!("Keyring error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone
        Err(e) => Err(AppError::Custom(format!("Keyring error: {e}"))),
    }
}
```

**Step 5: Add Tauri commands for key management in commands.rs**

```rust
// Near the top, add to use statement:
// use crate::llm;

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, AppError> {
    crate::llm::get_api_key(&provider)
}

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<serde_json::Value, AppError> {
    crate::llm::set_api_key(&provider, &key)?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<serde_json::Value, AppError> {
    crate::llm::delete_api_key(&provider)?;
    Ok(serde_json::json!({ "ok": true }))
}
```

**Step 6: Register module and commands in main.rs**

Add `mod llm;` after `mod linter;`.

Add to `invoke_handler`:
```rust
commands::get_api_key,
commands::set_api_key,
commands::delete_api_key,
```

**Step 7: Verify**

Run: `cd src-tauri && cargo build`
Expected: compiles with no errors. Keyring commands are registered.

**Commit:** `git commit -m "Add LLM types, reqwest/keyring deps, and API key management commands"`

---

### Task 2: Backend — Anthropic provider

Implement streaming HTTP calls to the Anthropic Messages API with SSE parsing.

**Files:**
- Modify: `src-tauri/src/llm.rs`

**Step 1: Add Anthropic streaming implementation**

Append to `src-tauri/src/llm.rs`:

```rust
use std::time::Instant;

use futures_util::StreamExt;
use reqwest::Client;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::types::{
    LlmMessage, PromptChunkPayload, PromptDonePayload, PromptErrorPayload,
};

/// Shared HTTP client — create once, reuse.
fn http_client() -> Client {
    Client::new()
}

/// Send a prompt to the Anthropic Messages API with streaming.
/// Emits Tauri events: `prompt-response-chunk`, `prompt-response-done`, `prompt-response-error`.
pub async fn send_anthropic(
    app: &AppHandle,
    request_id: &str,
    api_key: &str,
    model: &str,
    messages: &[LlmMessage],
    max_tokens: u32,
    temperature: f64,
) -> Result<(), AppError> {
    let start = Instant::now();
    let client = http_client();

    // Separate system message from conversation messages.
    let system_text: Option<String> = messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone());

    let api_messages: Vec<Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": true,
        "messages": api_messages,
    });

    if let Some(sys) = &system_text {
        body.as_object_mut()
            .unwrap()
            .insert("system".into(), Value::String(sys.clone()));
    }

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .body(serde_json::to_string(&body).unwrap())
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let msg = match serde_json::from_str::<Value>(&text) {
            Ok(v) => v["error"]["message"]
                .as_str()
                .unwrap_or(&text)
                .to_string(),
            Err(_) => text,
        };
        return Err(AppError::Custom(format!("Anthropic API {status}: {msg}")));
    }

    let mut full_content = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    let mut returned_model = model.to_string();

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines from buffer.
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end_matches('\r').to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }

            let event: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let event_type = event["type"].as_str().unwrap_or("");

            match event_type {
                "message_start" => {
                    if let Some(m) = event["message"].as_object() {
                        if let Some(model_str) = m.get("model").and_then(|v| v.as_str()) {
                            returned_model = model_str.to_string();
                        }
                        if let Some(usage) = m.get("usage").and_then(|v| v.as_object()) {
                            input_tokens =
                                usage.get("input_tokens").and_then(|v| v.as_u64()).map(|v| v as u32);
                        }
                    }
                }
                "content_block_delta" => {
                    if let Some(delta) = event["delta"]["text"].as_str() {
                        full_content.push_str(delta);
                        let _ = app.emit(
                            "prompt-response-chunk",
                            PromptChunkPayload {
                                request_id: request_id.to_string(),
                                delta: delta.to_string(),
                            },
                        );
                    }
                }
                "message_delta" => {
                    if let Some(usage) = event["usage"].as_object() {
                        output_tokens =
                            usage.get("output_tokens").and_then(|v| v.as_u64()).map(|v| v as u32);
                    }
                }
                _ => {}
            }
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    let _ = app.emit(
        "prompt-response-done",
        PromptDonePayload {
            request_id: request_id.to_string(),
            content: full_content,
            input_tokens,
            output_tokens,
            model: returned_model,
            duration_ms,
        },
    );

    Ok(())
}
```

**Step 2: Verify**

Run: `cd src-tauri && cargo check`
Expected: compiles (no runtime test yet — the Anthropic API needs a real key).

**Commit:** `git commit -m "Add Anthropic streaming provider in llm.rs"`

---

### Task 3: Backend — OpenAI provider

Implement streaming HTTP calls to the OpenAI Chat Completions API (also works with any OpenAI-compatible endpoint).

**Files:**
- Modify: `src-tauri/src/llm.rs`

**Step 1: Add OpenAI streaming implementation**

Append to `src-tauri/src/llm.rs`:

```rust
/// Send a prompt to an OpenAI-compatible Chat Completions API with streaming.
/// `base_url` defaults to `https://api.openai.com/v1` if not provided.
pub async fn send_openai(
    app: &AppHandle,
    request_id: &str,
    api_key: &str,
    model: &str,
    messages: &[LlmMessage],
    max_tokens: u32,
    temperature: f64,
    base_url: Option<&str>,
) -> Result<(), AppError> {
    let start = Instant::now();
    let client = http_client();

    let url = format!(
        "{}/chat/completions",
        base_url.unwrap_or("https://api.openai.com/v1").trim_end_matches('/')
    );

    let api_messages: Vec<Value> = messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .body(serde_json::to_string(&body).unwrap())
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let msg = match serde_json::from_str::<Value>(&text) {
            Ok(v) => v["error"]["message"]
                .as_str()
                .unwrap_or(&text)
                .to_string(),
            Err(_) => text,
        };
        return Err(AppError::Custom(format!("OpenAI API {status}: {msg}")));
    }

    let mut full_content = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    let mut returned_model = model.to_string();

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end_matches('\r').to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }

            let event: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Model from first chunk
            if let Some(m) = event["model"].as_str() {
                returned_model = m.to_string();
            }

            // Content delta
            if let Some(delta) = event["choices"]
                .get(0)
                .and_then(|c| c["delta"]["content"].as_str())
            {
                full_content.push_str(delta);
                let _ = app.emit(
                    "prompt-response-chunk",
                    PromptChunkPayload {
                        request_id: request_id.to_string(),
                        delta: delta.to_string(),
                    },
                );
            }

            // Usage (sent in final chunk with stream_options.include_usage)
            if let Some(usage) = event.get("usage").and_then(|u| u.as_object()) {
                input_tokens = usage
                    .get("prompt_tokens")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
                output_tokens = usage
                    .get("completion_tokens")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
            }
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    let _ = app.emit(
        "prompt-response-done",
        PromptDonePayload {
            request_id: request_id.to_string(),
            content: full_content,
            input_tokens,
            output_tokens,
            model: returned_model,
            duration_ms,
        },
    );

    Ok(())
}
```

**Step 2: Add a provider dispatch function**

Append to `src-tauri/src/llm.rs`:

```rust
/// Route a prompt to the correct provider based on provider name.
pub async fn send_prompt(
    app: &AppHandle,
    request_id: &str,
    provider: &str,
    model: &str,
    messages: &[LlmMessage],
    max_tokens: u32,
    temperature: f64,
) -> Result<(), AppError> {
    let api_key = get_api_key(provider)?
        .ok_or_else(|| AppError::Custom(format!("No API key configured for provider '{provider}'. Add one in Settings > API Keys.")))?;

    match provider {
        "anthropic" => {
            send_anthropic(app, request_id, &api_key, model, messages, max_tokens, temperature)
                .await
        }
        "openai" => {
            send_openai(app, request_id, &api_key, model, messages, max_tokens, temperature, None)
                .await
        }
        _ => Err(AppError::Custom(format!("Unknown provider: {provider}"))),
    }
}
```

**Step 3: Verify**

Run: `cd src-tauri && cargo check`
Expected: compiles.

**Commit:** `git commit -m "Add OpenAI streaming provider and dispatch function"`

---

### Task 4: Backend — run_prompt and cancel_prompt commands

Wire together template resolution, message building, LLM dispatch, and cancellation.

**Files:**
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add active request tracking to AppState**

In `src-tauri/src/state.rs`:

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use git2::Repository;
use tokio::sync::watch;

use crate::search::PromptSearch;
use crate::types::RepoConfig;

pub struct AppState {
    pub repo_root: PathBuf,
    pub config: RepoConfig,
    pub search: Mutex<PromptSearch>,
    pub repo: Mutex<Repository>,
    /// Active prompt request cancellation senders, keyed by request_id.
    pub active_requests: Mutex<HashMap<String, watch::Sender<bool>>>,
}
```

Update `commands::setup` in `commands.rs` to initialize the new field:

```rust
app.manage(AppState {
    repo_root,
    config,
    search: std::sync::Mutex::new(search),
    repo: std::sync::Mutex::new(repo),
    active_requests: std::sync::Mutex::new(std::collections::HashMap::new()),
});
```

**Step 2: Add run_prompt command**

In `commands.rs`:

```rust
use crate::types::PromptErrorPayload;

#[tauri::command]
pub async fn run_prompt(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request_id: String,
    path: String,
    provider: String,
    model: String,
    variables: Option<std::collections::HashMap<String, String>>,
    max_tokens: Option<u32>,
    temperature: Option<f64>,
) -> Result<serde_json::Value, AppError> {
    // 1. Resolve template
    let content = crate::file_ops::read_raw(&state.repo_root, &path)?;
    let resolved = crate::template::resolve_template(
        &path, &content, &state.repo_root, variables.as_ref(),
    )?;

    // 2. Build messages — entire resolved text as a single user message.
    //    If the frontmatter has modelTargets, the first one matching the model
    //    could inform system prompt, but for now we keep it simple.
    let messages = vec![
        crate::types::LlmMessage {
            role: "user".into(),
            content: resolved.text,
        },
    ];

    let max_tok = max_tokens.unwrap_or(1024);
    let temp = temperature.unwrap_or(1.0);

    // 3. Register cancellation channel
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    {
        let mut reqs = state.active_requests.lock()
            .map_err(|_| AppError::Custom("Internal lock error".into()))?;
        reqs.insert(request_id.clone(), cancel_tx);
    }

    // 4. Spawn the streaming task so this command returns immediately.
    let rid = request_id.clone();
    let prov = provider.clone();
    let mdl = model.clone();
    let app2 = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut cancel_rx = cancel_rx;

        let result = tokio::select! {
            res = crate::llm::send_prompt(
                &app2, &rid, &prov, &mdl, &messages, max_tok, temp,
            ) => res,
            _ = async {
                loop {
                    cancel_rx.changed().await.ok();
                    if *cancel_rx.borrow() { break; }
                }
            } => {
                Err(AppError::Custom("Request cancelled".into()))
            }
        };

        if let Err(e) = result {
            let _ = app2.emit(
                "prompt-response-error",
                PromptErrorPayload {
                    request_id: rid.clone(),
                    error: e.to_string(),
                },
            );
        }

        // Cleanup
        if let Ok(state) = app2.try_state::<AppState>() {
            if let Ok(mut reqs) = state.active_requests.lock() {
                reqs.remove(&rid);
            }
        }
    });

    Ok(serde_json::json!({ "requestId": request_id }))
}
```

**Step 3: Add cancel_prompt command**

```rust
#[tauri::command]
pub fn cancel_prompt(
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> Result<serde_json::Value, AppError> {
    let reqs = state.active_requests.lock()
        .map_err(|_| AppError::Custom("Internal lock error".into()))?;
    if let Some(tx) = reqs.get(&request_id) {
        let _ = tx.send(true);
    }
    Ok(serde_json::json!({ "ok": true }))
}
```

**Step 4: Register commands in main.rs**

Add to `invoke_handler`:
```rust
commands::run_prompt,
commands::cancel_prompt,
```

**Step 5: Verify**

Run: `cd src-tauri && cargo build`
Expected: compiles. The `run_prompt` command returns immediately, streams via events.

**Commit:** `git commit -m "Add run_prompt and cancel_prompt commands with cancellation support"`

---

### Task 5: Frontend — Testing store

Create the state management store that listens for Tauri events and drives the TestPanel UI.

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/stores/testing.ts`
- Modify: `src/lib/ipc.ts`

**Step 1: Add TypeScript types**

Append to `src/lib/types.ts`:

```typescript
// ---------------------------------------------------------------------------
// LLM / Prompt Testing
// ---------------------------------------------------------------------------

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
  durationMs: number;
}

export interface TestRunState {
  running: boolean;
  response: string;
  error: string | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  model?: string;
}

export interface PromptChunkPayload {
  requestId: string;
  delta: string;
}

export interface PromptDonePayload {
  requestId: string;
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
  durationMs: number;
}

export interface PromptErrorPayload {
  requestId: string;
  error: string;
}
```

**Step 2: Add IPC methods**

Add to the `api` object in `src/lib/ipc.ts`:

```typescript
// Prompt testing
runPrompt: (
  requestId: string,
  path: string,
  provider: string,
  model: string,
  variables?: Record<string, string>,
  maxTokens?: number,
  temperature?: number,
) =>
  call<{ requestId: string }>("run_prompt", {
    request_id: requestId,
    path,
    provider,
    model,
    variables,
    max_tokens: maxTokens,
    temperature,
  }),
cancelPrompt: (requestId: string) =>
  call<{ ok: boolean }>("cancel_prompt", { request_id: requestId }),

// API key management
getApiKey: (provider: string) =>
  call<string | null>("get_api_key", { provider }),
setApiKey: (provider: string, key: string) =>
  call<{ ok: boolean }>("set_api_key", { provider, key }),
deleteApiKey: (provider: string) =>
  call<{ ok: boolean }>("delete_api_key", { provider }),
```

Also add the new types to the import at the top of `ipc.ts`.

**Step 3: Create testing store**

Create `src/lib/stores/testing.ts`:

```typescript
import { writable, get } from "svelte/store";
import type {
  TestRunState,
  PromptChunkPayload,
  PromptDonePayload,
  PromptErrorPayload,
} from "../types";
import { api } from "../ipc";
import { activeFile, variableValues } from "./editor";
import { addToast } from "./toast";

export const testState = writable<TestRunState>({
  running: false,
  response: "",
  error: null,
});

export const testProvider = writable<string>("anthropic");
export const testModel = writable<string>("claude-sonnet-4-20250514");
export const testMaxTokens = writable<number>(1024);
export const testTemperature = writable<number>(1.0);

let currentRequestId: string | null = null;
let unlistenChunk: (() => void) | null = null;
let unlistenDone: (() => void) | null = null;
let unlistenError: (() => void) | null = null;

/**
 * Set up Tauri event listeners for streaming responses.
 * Call once when the app mounts.
 */
export async function initTestListeners(): Promise<void> {
  const { listen } = await import("@tauri-apps/api/event");

  unlistenChunk = await listen<PromptChunkPayload>(
    "prompt-response-chunk",
    (event) => {
      if (event.payload.requestId !== currentRequestId) return;
      testState.update((s) => ({
        ...s,
        response: s.response + event.payload.delta,
      }));
    },
  );

  unlistenDone = await listen<PromptDonePayload>(
    "prompt-response-done",
    (event) => {
      if (event.payload.requestId !== currentRequestId) return;
      testState.update((s) => ({
        ...s,
        running: false,
        response: event.payload.content,
        inputTokens: event.payload.inputTokens,
        outputTokens: event.payload.outputTokens,
        model: event.payload.model,
        durationMs: event.payload.durationMs,
      }));
      currentRequestId = null;
    },
  );

  unlistenError = await listen<PromptErrorPayload>(
    "prompt-response-error",
    (event) => {
      if (event.payload.requestId !== currentRequestId) return;
      testState.update((s) => ({
        ...s,
        running: false,
        error: event.payload.error,
      }));
      currentRequestId = null;
    },
  );
}

/** Tear down listeners. Call on app unmount. */
export function destroyTestListeners(): void {
  unlistenChunk?.();
  unlistenDone?.();
  unlistenError?.();
}

/** Generate a simple unique request ID. */
function makeRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Run the current prompt against the selected model. */
export async function runTest(): Promise<void> {
  const file = get(activeFile);
  if (!file) {
    addToast("No file open", "error");
    return;
  }

  const provider = get(testProvider);
  const model = get(testModel);
  const maxTokens = get(testMaxTokens);
  const temperature = get(testTemperature);
  const vars = get(variableValues);
  const hasVars = Object.values(vars).some((v) => v !== "");

  const requestId = makeRequestId();
  currentRequestId = requestId;

  testState.set({
    running: true,
    response: "",
    error: null,
  });

  try {
    await api.runPrompt(
      requestId,
      file.path,
      provider,
      model,
      hasVars ? vars : undefined,
      maxTokens,
      temperature,
    );
  } catch (err) {
    testState.update((s) => ({
      ...s,
      running: false,
      error: String(err),
    }));
    currentRequestId = null;
  }
}

/** Cancel the in-flight request. */
export async function cancelTest(): Promise<void> {
  if (!currentRequestId) return;
  try {
    await api.cancelPrompt(currentRequestId);
  } catch {
    // ignore
  }
}
```

**Step 4: Verify**

Run: `npm run check` (Svelte type checking)
Expected: no type errors.

**Commit:** `git commit -m "Add testing store with Tauri event listeners and IPC methods"`

---

### Task 6: Frontend — TestPanel component

Build the TestPanel UI with model selection, parameter controls, streaming response display, and token usage stats.

**Files:**
- Create: `src/lib/components/TestPanel.svelte`

**Step 1: Create TestPanel.svelte**

Create `src/lib/components/TestPanel.svelte`:

```svelte
<script lang="ts">
  import {
    testState,
    testProvider,
    testModel,
    testMaxTokens,
    testTemperature,
    runTest,
    cancelTest,
  } from "$lib/stores/testing";
  import { activeFile } from "$lib/stores/editor";
  import { addToast } from "$lib/stores/toast";

  let copied = $state(false);

  const providers = [
    { id: "anthropic", label: "Anthropic" },
    { id: "openai", label: "OpenAI" },
  ];

  const modelsByProvider: Record<string, string[]> = {
    anthropic: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250414",
      "claude-opus-4-20250514",
    ],
    openai: [
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
    ],
  };

  $effect(() => {
    // When provider changes, reset model to first option.
    const models = modelsByProvider[$testProvider] ?? [];
    if (!models.includes($testModel)) {
      testModel.set(models[0] ?? "");
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!$testState.running) {
        runTest();
      }
    }
  }

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText($testState.response);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      addToast("Failed to copy", "error");
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTokens(n: number | undefined): string {
    if (n == null) return "--";
    return n.toLocaleString();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="test-panel">
  {#if !$activeFile}
    <div class="empty-state">
      <span class="icon">&#9881;</span>
      <span class="message">Open a prompt to test it</span>
    </div>
  {:else}
    <!-- Controls -->
    <div class="controls">
      <div class="control-row">
        <label class="control-label" for="test-provider">Provider</label>
        <select
          id="test-provider"
          class="control-select"
          bind:value={$testProvider}
          disabled={$testState.running}
        >
          {#each providers as p}
            <option value={p.id}>{p.label}</option>
          {/each}
        </select>
      </div>

      <div class="control-row">
        <label class="control-label" for="test-model">Model</label>
        <select
          id="test-model"
          class="control-select"
          bind:value={$testModel}
          disabled={$testState.running}
        >
          {#each modelsByProvider[$testProvider] ?? [] as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>

      <div class="control-row">
        <label class="control-label" for="test-temp">
          Temperature <span class="value-badge">{$testTemperature.toFixed(1)}</span>
        </label>
        <input
          id="test-temp"
          type="range"
          class="range-input"
          min="0"
          max="2"
          step="0.1"
          bind:value={$testTemperature}
          disabled={$testState.running}
        />
      </div>

      <div class="control-row">
        <label class="control-label" for="test-max-tokens">Max tokens</label>
        <input
          id="test-max-tokens"
          type="number"
          class="number-input"
          min="1"
          max="128000"
          bind:value={$testMaxTokens}
          disabled={$testState.running}
        />
      </div>
    </div>

    <!-- Action buttons -->
    <div class="actions">
      {#if $testState.running}
        <button class="btn btn-stop" onclick={cancelTest}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/>
          </svg>
          Stop
        </button>
      {:else}
        <button
          class="btn btn-run"
          onclick={runTest}
          disabled={!$activeFile}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon points="2,1 11,6 2,11" fill="currentColor"/>
          </svg>
          Run
          <kbd class="shortcut-hint">{navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}\u23CE</kbd>
        </button>
      {/if}
    </div>

    <!-- Response area -->
    <div class="response-area">
      {#if $testState.error}
        <div class="error-banner">
          <strong>Error:</strong> {$testState.error}
        </div>
      {/if}

      {#if $testState.response}
        <div class="response-header">
          <span class="response-label">Response</span>
          <button class="copy-btn" onclick={copyResponse}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="response-text">{$testState.response}{#if $testState.running}<span class="cursor">|</span>{/if}</pre>
      {:else if $testState.running}
        <div class="waiting">Waiting for response...</div>
      {:else}
        <div class="empty-response">
          <span class="hint">Press Run or {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to test this prompt</span>
        </div>
      {/if}
    </div>

    <!-- Stats footer -->
    {#if $testState.durationMs != null || $testState.inputTokens != null}
      <div class="stats-bar">
        {#if $testState.model}
          <span class="stat">{$testState.model}</span>
        {/if}
        <span class="stat">
          <span class="stat-label">In:</span> {formatTokens($testState.inputTokens)}
        </span>
        <span class="stat">
          <span class="stat-label">Out:</span> {formatTokens($testState.outputTokens)}
        </span>
        {#if $testState.durationMs != null}
          <span class="stat">
            <span class="stat-label">Time:</span> {formatDuration($testState.durationMs)}
          </span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .test-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--space-2);
    padding: var(--space-3);
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-8);
    text-align: center;
  }
  .empty-state .icon {
    font-size: 24px;
    opacity: 0.4;
  }
  .empty-state .message {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
  }

  /* Controls */
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .control-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }
  .value-badge {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    margin-left: var(--space-1);
  }
  .control-select,
  .number-input {
    flex: 1;
    max-width: 200px;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    outline: none;
  }
  .control-select:focus,
  .number-input:focus {
    border-color: var(--border-focus);
  }
  .range-input {
    flex: 1;
    max-width: 200px;
    accent-color: var(--accent);
  }

  /* Actions */
  .actions {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    border: none;
    transition: all var(--transition-fast);
  }
  .btn-run {
    background: var(--accent);
    color: white;
  }
  .btn-run:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn-run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-stop {
    background: var(--error);
    color: white;
  }
  .btn-stop:hover {
    filter: brightness(1.1);
  }
  .shortcut-hint {
    font-size: var(--font-size-xs);
    opacity: 0.7;
    margin-left: var(--space-1);
    font-family: var(--font-mono);
    background: none;
    border: none;
    padding: 0;
    color: inherit;
  }

  /* Response */
  .response-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 120px;
  }
  .response-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-1);
  }
  .response-label {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .copy-btn {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-2);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .copy-btn:hover {
    color: var(--text-primary);
    border-color: var(--border-focus);
  }
  .response-text {
    flex: 1;
    padding: var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
    margin: 0;
  }
  .cursor {
    animation: blink 1s step-end infinite;
    color: var(--accent);
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
  .error-banner {
    padding: var(--space-2);
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border: 1px solid var(--error);
    border-radius: var(--radius-md);
    color: var(--error);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-2);
  }
  .waiting,
  .empty-response {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
    font-style: italic;
  }
  .hint {
    font-size: var(--font-size-xs);
    color: var(--text-quaternary);
  }

  /* Stats */
  .stats-bar {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    border-top: 1px solid var(--border-secondary);
    flex-wrap: wrap;
  }
  .stat {
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    color: var(--text-tertiary);
  }
  .stat-label {
    color: var(--text-quaternary);
  }
</style>
```

**Step 2: Verify**

Run: `npm run check`
Expected: no type errors in TestPanel.svelte.

**Commit:** `git commit -m "Add TestPanel component with streaming display and model controls"`

---

### Task 7: Frontend — Integration

Wire TestPanel into the Inspector as a new tab, initialize event listeners on app mount, and add the Cmd+Enter keyboard shortcut.

**Files:**
- Modify: `src/lib/components/Inspector.svelte`
- Modify: `src/App.svelte` (or wherever the app shell mounts)

**Step 1: Add Test tab to Inspector**

Modify `src/lib/components/Inspector.svelte` to add a tabbed interface with Metadata, Variables, History, and Test tabs:

```svelte
<script lang="ts">
  import MetadataPanel from "./MetadataPanel.svelte";
  import VariablesPanel from "./VariablesPanel.svelte";
  import HistoryPanel from "./HistoryPanel.svelte";
  import TestPanel from "./TestPanel.svelte";
  import { activeFile } from "../stores/editor";

  let inspectorTab = $state<"metadata" | "variables" | "history" | "test">("metadata");

  const tabs: Array<{ id: typeof inspectorTab; label: string }> = [
    { id: "metadata", label: "Metadata" },
    { id: "variables", label: "Variables" },
    { id: "history", label: "History" },
    { id: "test", label: "Test" },
  ];
</script>

<aside class="inspector">
  {#if $activeFile}
    <nav class="inspector-tabs">
      {#each tabs as tab}
        <button
          class="inspector-tab"
          class:active={inspectorTab === tab.id}
          onclick={() => (inspectorTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <div class="inspector-content">
      {#if inspectorTab === "metadata"}
        <MetadataPanel />
      {:else if inspectorTab === "variables"}
        <VariablesPanel />
      {:else if inspectorTab === "history"}
        <HistoryPanel />
      {:else if inspectorTab === "test"}
        <TestPanel />
      {/if}
    </div>
  {:else}
    <div class="empty">
      <p>No file selected</p>
    </div>
  {/if}
</aside>
```

Add styles for the tabs (use the same pattern as SettingsModal tabs):

```css
.inspector-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}
.inspector-tab {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  border: none;
  background: none;
  cursor: pointer;
}
.inspector-tab:hover {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}
.inspector-tab.active {
  color: var(--accent);
  background: var(--accent-subtle);
}
.inspector-content {
  flex: 1;
  overflow-y: auto;
}
```

**Step 2: Initialize event listeners on app mount**

In the root app component (likely `src/App.svelte` or `src/routes/+page.svelte`), add:

```typescript
import { onMount, onDestroy } from "svelte";
import { initTestListeners, destroyTestListeners } from "$lib/stores/testing";

onMount(() => {
  initTestListeners();
});

onDestroy(() => {
  destroyTestListeners();
});
```

**Step 3: Verify**

Run: `npm run check && npm run dev`
Expected: Inspector shows 4 tabs. Clicking "Test" shows the TestPanel. Cmd+Enter triggers run when on the Test tab (will error without API key — that's expected).

**Commit:** `git commit -m "Wire TestPanel into Inspector with tab navigation and event listener lifecycle"`

---

### Task 8: Frontend — API Key settings

Add an "API Keys" tab to SettingsModal so users can configure their provider credentials without touching config files.

**Files:**
- Modify: `src/lib/components/SettingsModal.svelte`

**Step 1: Add "API Keys" tab**

Update the `tabs` array and `activeTab` type in SettingsModal.svelte:

```typescript
let activeTab = $state<"general" | "editor" | "appearance" | "apikeys">("general");

const tabs: Array<{ id: typeof activeTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
  { id: "appearance", label: "Appearance" },
  { id: "apikeys", label: "API Keys" },
];
```

**Step 2: Add API key management state and logic**

Add to the `<script>` section:

```typescript
import { api } from "../ipc";

let anthropicKey = $state("");
let openaiKey = $state("");
let anthropicKeySet = $state(false);
let openaiKeySet = $state(false);
let savingKey = $state<string | null>(null);

// Load key status (not the actual keys — just whether they exist)
onMount(async () => {
  // ... existing onMount logic ...

  try {
    const ak = await api.getApiKey("anthropic");
    anthropicKeySet = ak != null;
  } catch { /* ignore */ }
  try {
    const ok = await api.getApiKey("openai");
    openaiKeySet = ok != null;
  } catch { /* ignore */ }
});

async function saveKey(provider: string) {
  const key = provider === "anthropic" ? anthropicKey : openaiKey;
  if (!key.trim()) return;

  savingKey = provider;
  try {
    await api.setApiKey(provider, key.trim());
    if (provider === "anthropic") {
      anthropicKeySet = true;
      anthropicKey = "";
    } else {
      openaiKeySet = true;
      openaiKey = "";
    }
  } catch (err) {
    console.warn("Failed to save API key:", err);
  }
  savingKey = null;
}

async function removeKey(provider: string) {
  try {
    await api.deleteApiKey(provider);
    if (provider === "anthropic") {
      anthropicKeySet = false;
    } else {
      openaiKeySet = false;
    }
  } catch (err) {
    console.warn("Failed to delete API key:", err);
  }
}
```

**Step 3: Add the API Keys tab content**

Add after the `{:else if activeTab === "appearance"}` block, before the closing `{/if}`:

```svelte
{:else if activeTab === "apikeys"}
  <div class="apikeys-info">
    API keys are stored securely in your operating system's keychain.
    They are never written to project files.
  </div>

  <div class="setting-row">
    <div class="setting-label">
      <span class="label-text">Anthropic</span>
      <span class="label-hint">For Claude models (claude-sonnet-4, etc.)</span>
    </div>
    <div class="setting-control key-control">
      {#if anthropicKeySet}
        <span class="key-status set">Configured</span>
        <button class="key-remove" onclick={() => removeKey("anthropic")}>Remove</button>
      {:else}
        <input
          type="password"
          class="text-input key-input"
          placeholder="sk-ant-..."
          bind:value={anthropicKey}
          onkeydown={(e) => { if (e.key === "Enter") saveKey("anthropic"); }}
        />
        <button
          class="key-save"
          onclick={() => saveKey("anthropic")}
          disabled={!anthropicKey.trim() || savingKey === "anthropic"}
        >
          {savingKey === "anthropic" ? "Saving..." : "Save"}
        </button>
      {/if}
    </div>
  </div>

  <div class="setting-row">
    <div class="setting-label">
      <span class="label-text">OpenAI</span>
      <span class="label-hint">For GPT models and OpenAI-compatible APIs</span>
    </div>
    <div class="setting-control key-control">
      {#if openaiKeySet}
        <span class="key-status set">Configured</span>
        <button class="key-remove" onclick={() => removeKey("openai")}>Remove</button>
      {:else}
        <input
          type="password"
          class="text-input key-input"
          placeholder="sk-..."
          bind:value={openaiKey}
          onkeydown={(e) => { if (e.key === "Enter") saveKey("openai"); }}
        />
        <button
          class="key-save"
          onclick={() => saveKey("openai")}
          disabled={!openaiKey.trim() || savingKey === "openai"}
        >
          {savingKey === "openai" ? "Saving..." : "Save"}
        </button>
      {/if}
    </div>
  </div>
```

**Step 4: Add styles for API key UI**

Append to the `<style>` section:

```css
.apikeys-info {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  padding: var(--space-2) 0 var(--space-3) 0;
  line-height: 1.5;
}

.key-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.key-input {
  width: 140px;
}

.key-save {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: filter var(--transition-fast);
  white-space: nowrap;
}
.key-save:hover:not(:disabled) {
  filter: brightness(1.1);
}
.key-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-remove {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  background: none;
  color: var(--error);
  border: 1px solid var(--error);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.key-remove:hover {
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.key-status {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
}
.key-status.set {
  color: var(--success, #4caf50);
}
```

**Step 5: Verify**

Run: `npm run check && npm run dev`
Expected: Settings modal shows 4 tabs. "API Keys" tab shows Anthropic/OpenAI sections. Entering a key and pressing Save stores it in the OS keychain. "Configured" status shows when a key is set. "Remove" deletes it.

**Commit:** `git commit -m "Add API Keys tab to SettingsModal with secure keychain storage"`
