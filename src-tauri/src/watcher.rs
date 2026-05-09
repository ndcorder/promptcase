use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use tauri::{AppHandle, Emitter};

pub struct WatcherState {
    debouncer: Option<Debouncer<notify::RecommendedWatcher, RecommendedCache>>,
    in_flight: Arc<Mutex<HashSet<PathBuf>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            in_flight: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn start(&mut self, app_handle: AppHandle, repo_path: PathBuf) -> Result<(), String> {
        if self.debouncer.is_some() {
            return Ok(());
        }

        let in_flight = self.in_flight.clone();
        let handle = app_handle.clone();

        let debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                let events = match result {
                    Ok(events) => events,
                    Err(_) => return,
                };

                let in_flight_guard = in_flight.lock().unwrap();
                let mut changed_paths: Vec<String> = Vec::new();

                for event in &events {
                    for path in &event.paths {
                        if in_flight_guard.contains(path) {
                            continue;
                        }
                        let ext = path.extension().and_then(|e| e.to_str());
                        if ext != Some("md") {
                            continue;
                        }
                        if let Some(s) = path.to_str() {
                            if !changed_paths.contains(&s.to_string()) {
                                changed_paths.push(s.to_string());
                            }
                        }
                    }
                }
                drop(in_flight_guard);

                if !changed_paths.is_empty() {
                    let _ = handle.emit("files-changed", serde_json::json!({ "paths": changed_paths }));
                }
            },
        ).map_err(|e| format!("Failed to create file watcher: {e}"))?;

        self.debouncer = Some(debouncer);

        self.debouncer.as_mut().unwrap().watch(&repo_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch directory: {e}"))?;

        Ok(())
    }

    pub fn stop(&mut self) {
        self.debouncer = None;
    }

    pub fn mark_writing(&self, path: PathBuf) {
        self.in_flight.lock().unwrap().insert(path);
    }

    pub fn unmark_writing(&self, path: PathBuf) {
        self.in_flight.lock().unwrap().remove(&path);
    }
}
