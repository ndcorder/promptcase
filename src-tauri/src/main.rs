#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod error;
mod file_ops;
mod frontmatter;
mod git_ops;
mod linter;
mod search;
mod state;
mod template;
mod tokenizer;
mod types;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            commands::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_files,
            commands::read_file,
            commands::write_file,
            commands::create_file,
            commands::delete_file,
            commands::move_file,
            commands::git_log,
            commands::git_diff,
            commands::git_restore,
            commands::git_status,
            commands::resolve_template,
            commands::lint_file,
            commands::lint_all,
            commands::get_variables,
            commands::count_tokens,
            commands::count_tokens_resolved,
            commands::search_query,
            commands::search_reindex,
            commands::get_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
