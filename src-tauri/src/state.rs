use std::path::PathBuf;
use std::sync::Mutex;

use git2::Repository;

use crate::search::PromptSearch;
use crate::types::RepoConfig;

pub struct AppState {
    pub repo_root: PathBuf,
    pub config: RepoConfig,
    pub search: Mutex<PromptSearch>,
    pub repo: Mutex<Repository>,
}
