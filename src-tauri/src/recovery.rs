use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

const RECOVERY_FILE: &str = ".promptcase-recovery.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryBuffer {
    pub path: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RecoveryData {
    buffers: Vec<RecoveryBuffer>,
}

pub fn save_recovery_buffer(repo_path: &Path, file_path: &str, content: &str) {
    let recovery_path = repo_path.join(RECOVERY_FILE);
    let mut data = load_recovery_data(&recovery_path);

    let timestamp = chrono_now();
    if let Some(entry) = data.buffers.iter_mut().find(|b| b.path == file_path) {
        entry.content = content.to_string();
        entry.timestamp = timestamp;
    } else {
        data.buffers.push(RecoveryBuffer {
            path: file_path.to_string(),
            content: content.to_string(),
            timestamp,
        });
    }

    let _ = write_recovery_data(&recovery_path, &data);
}

pub fn clear_recovery_buffer(repo_path: &Path, file_path: &str) {
    let recovery_path = repo_path.join(RECOVERY_FILE);
    let mut data = load_recovery_data(&recovery_path);
    data.buffers.retain(|b| b.path != file_path);

    if data.buffers.is_empty() {
        let _ = fs::remove_file(&recovery_path);
    } else {
        let _ = write_recovery_data(&recovery_path, &data);
    }
}

pub fn load_recovery(repo_path: &Path) -> Vec<RecoveryBuffer> {
    let recovery_path = repo_path.join(RECOVERY_FILE);
    load_recovery_data(&recovery_path).buffers
}

pub fn clear_all_recovery(repo_path: &Path) {
    let recovery_path = repo_path.join(RECOVERY_FILE);
    let _ = fs::remove_file(&recovery_path);
}

fn load_recovery_data(path: &Path) -> RecoveryData {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(RecoveryData { buffers: vec![] })
}

fn write_recovery_data(path: &Path, data: &RecoveryData) -> Result<(), std::io::Error> {
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(path, json)
}

fn chrono_now() -> String {
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Simple epoch-to-date: days since 1970-01-01
    let (year, month, day) = epoch_days_to_date(days);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn epoch_days_to_date(mut days: u64) -> (u64, u64, u64) {
    let mut year = 1970;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = is_leap(year);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 0;
    for (i, &md) in month_days.iter().enumerate() {
        if days < md {
            month = i as u64 + 1;
            break;
        }
        days -= md;
    }
    (year, month, days + 1)
}

fn is_leap(y: u64) -> bool {
    y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn save_and_load_recovery() {
        let dir = TempDir::new().unwrap();
        save_recovery_buffer(dir.path(), "test.md", "hello world");

        let buffers = load_recovery(dir.path());
        assert_eq!(buffers.len(), 1);
        assert_eq!(buffers[0].path, "test.md");
        assert_eq!(buffers[0].content, "hello world");
    }

    #[test]
    fn upsert_existing_buffer() {
        let dir = TempDir::new().unwrap();
        save_recovery_buffer(dir.path(), "test.md", "v1");
        save_recovery_buffer(dir.path(), "test.md", "v2");

        let buffers = load_recovery(dir.path());
        assert_eq!(buffers.len(), 1);
        assert_eq!(buffers[0].content, "v2");
    }

    #[test]
    fn clear_single_buffer() {
        let dir = TempDir::new().unwrap();
        save_recovery_buffer(dir.path(), "a.md", "aaa");
        save_recovery_buffer(dir.path(), "b.md", "bbb");
        clear_recovery_buffer(dir.path(), "a.md");

        let buffers = load_recovery(dir.path());
        assert_eq!(buffers.len(), 1);
        assert_eq!(buffers[0].path, "b.md");
    }

    #[test]
    fn clear_all() {
        let dir = TempDir::new().unwrap();
        save_recovery_buffer(dir.path(), "a.md", "aaa");
        clear_all_recovery(dir.path());

        let buffers = load_recovery(dir.path());
        assert!(buffers.is_empty());
        assert!(!dir.path().join(RECOVERY_FILE).exists());
    }

    #[test]
    fn load_empty_returns_empty() {
        let dir = TempDir::new().unwrap();
        let buffers = load_recovery(dir.path());
        assert!(buffers.is_empty());
    }

    #[test]
    fn clear_last_buffer_removes_file() {
        let dir = TempDir::new().unwrap();
        save_recovery_buffer(dir.path(), "a.md", "aaa");
        clear_recovery_buffer(dir.path(), "a.md");
        assert!(!dir.path().join(RECOVERY_FILE).exists());
    }
}
