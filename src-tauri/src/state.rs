use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use git2::Repository;

use crate::search::PromptSearch;
use crate::types::RepoConfig;

pub struct AppState {
    pub repo_root: PathBuf,
    pub config: RepoConfig,
    pub search: Mutex<PromptSearch>,
    pub repo: Mutex<Repository>,
    pub prompt_cancelled: Arc<AtomicBool>,
}
