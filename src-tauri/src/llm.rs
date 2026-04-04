use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use reqwest::Client;
use serde_json::Value;
use tauri::Emitter;

use crate::error::AppError;
use crate::types::{
    LlmMessage, PromptChunkPayload, PromptDonePayload, PromptErrorPayload, RunPromptRequest,
};

const KEYRING_SERVICE: &str = "com.promptcase.app";

// ---------------------------------------------------------------------------
// Keyring helpers
// ---------------------------------------------------------------------------

pub fn get_api_key(provider: &str) -> Result<Option<String>, AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| AppError::Custom(format!("keyring error: {e}")))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Custom(format!("keyring error: {e}"))),
    }
}

pub fn set_api_key(provider: &str, key: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| AppError::Custom(format!("keyring error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| AppError::Custom(format!("keyring error: {e}")))
}

pub fn delete_api_key(provider: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| AppError::Custom(format!("keyring error: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Custom(format!("keyring error: {e}"))),
    }
}

// ---------------------------------------------------------------------------
// Streaming: Anthropic
// ---------------------------------------------------------------------------

pub async fn stream_anthropic(
    app: &tauri::AppHandle,
    api_key: &str,
    messages: &[LlmMessage],
    model: &str,
    temperature: f32,
    max_tokens: u32,
    cancelled: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let client = Client::new();

    // Build Anthropic messages format
    let api_messages: Vec<Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let system_text = messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone());

    let mut body = serde_json::json!({
        "model": model,
        "messages": api_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": true,
    });

    if let Some(sys) = system_text {
        body["system"] = Value::String(sys);
    }

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!(
            "Anthropic API error ({status}): {text}"
        )));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;

    while let Some(chunk_result) = stream.next().await {
        if cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        let chunk = chunk_result?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }

            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(data) {
                let event_type = event["type"].as_str().unwrap_or("");

                match event_type {
                    "message_start" => {
                        if let Some(usage) = event["message"]["usage"].as_object() {
                            input_tokens = usage
                                .get("input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0) as u32;
                        }
                    }
                    "content_block_delta" => {
                        if let Some(text) =
                            event["delta"]["text"].as_str()
                        {
                            let _ = app.emit(
                                "prompt-response-chunk",
                                PromptChunkPayload {
                                    text: text.to_string(),
                                },
                            );
                        }
                    }
                    "message_delta" => {
                        if let Some(usage) = event["usage"].as_object() {
                            output_tokens = usage
                                .get("output_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0) as u32;
                        }
                    }
                    "message_stop" => {
                        let _ = app.emit(
                            "prompt-response-done",
                            PromptDonePayload {
                                model: model.to_string(),
                                input_tokens,
                                output_tokens,
                            },
                        );
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Streaming: OpenAI
// ---------------------------------------------------------------------------

pub async fn stream_openai(
    app: &tauri::AppHandle,
    api_key: &str,
    messages: &[LlmMessage],
    model: &str,
    temperature: f32,
    max_tokens: u32,
    cancelled: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let client = Client::new();

    let api_messages: Vec<Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": model,
        "messages": api_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!(
            "OpenAI API error ({status}): {text}"
        )));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;

    while let Some(chunk_result) = stream.next().await {
        if cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        let chunk = chunk_result?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }

            let data = &line[6..];
            if data == "[DONE]" {
                let _ = app.emit(
                    "prompt-response-done",
                    PromptDonePayload {
                        model: model.to_string(),
                        input_tokens,
                        output_tokens,
                    },
                );
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(data) {
                // Content delta
                if let Some(choices) = event["choices"].as_array() {
                    for choice in choices {
                        if let Some(text) = choice["delta"]["content"].as_str() {
                            if !text.is_empty() {
                                let _ = app.emit(
                                    "prompt-response-chunk",
                                    PromptChunkPayload {
                                        text: text.to_string(),
                                    },
                                );
                            }
                        }
                    }
                }

                // Usage (comes with stream_options.include_usage)
                if let Some(usage) = event["usage"].as_object() {
                    input_tokens = usage
                        .get("prompt_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    output_tokens = usage
                        .get("completion_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                }
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Run prompt (dispatches to provider)
// ---------------------------------------------------------------------------

pub async fn run_prompt_stream(
    app: tauri::AppHandle,
    req: RunPromptRequest,
    cancelled: Arc<AtomicBool>,
) {
    let api_key = match get_api_key(&req.provider) {
        Ok(Some(key)) => key,
        Ok(None) => {
            let _ = app.emit(
                "prompt-response-error",
                PromptErrorPayload {
                    error: format!("No API key configured for {}", req.provider),
                },
            );
            return;
        }
        Err(e) => {
            let _ = app.emit(
                "prompt-response-error",
                PromptErrorPayload {
                    error: format!("Failed to read API key: {e}"),
                },
            );
            return;
        }
    };

    let result = match req.provider.as_str() {
        "anthropic" => {
            stream_anthropic(
                &app,
                &api_key,
                &req.messages,
                &req.model,
                req.temperature,
                req.max_tokens,
                cancelled,
            )
            .await
        }
        "openai" => {
            stream_openai(
                &app,
                &api_key,
                &req.messages,
                &req.model,
                req.temperature,
                req.max_tokens,
                cancelled,
            )
            .await
        }
        other => Err(AppError::Custom(format!("Unknown provider: {other}"))),
    };

    if let Err(e) = result {
        let _ = app.emit(
            "prompt-response-error",
            PromptErrorPayload {
                error: e.to_string(),
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_prompt_request_serde() {
        let req = RunPromptRequest {
            provider: "anthropic".to_string(),
            model: "claude-sonnet-4-20250514".to_string(),
            messages: vec![LlmMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            }],
            temperature: 0.7,
            max_tokens: 1024,
        };
        let json = serde_json::to_string(&req).unwrap();
        let parsed: RunPromptRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.provider, "anthropic");
        assert_eq!(parsed.messages.len(), 1);
    }

    #[test]
    fn test_payload_serde() {
        let chunk = PromptChunkPayload {
            text: "hello".to_string(),
        };
        let json = serde_json::to_string(&chunk).unwrap();
        assert!(json.contains("hello"));

        let done = PromptDonePayload {
            model: "gpt-4".to_string(),
            input_tokens: 100,
            output_tokens: 50,
        };
        let json = serde_json::to_string(&done).unwrap();
        assert!(json.contains("gpt-4"));

        let err = PromptErrorPayload {
            error: "test error".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("test error"));
    }
}
