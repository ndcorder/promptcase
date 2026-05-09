#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod llm;
mod recovery;
mod state;
mod watcher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            commands::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_watcher,
            commands::stop_watcher,
            commands::mark_file_writing,
            commands::unmark_file_writing,
            commands::list_files,
            commands::list_folders,
            commands::list_tags,
            commands::rename_tag,
            commands::delete_tag,
            commands::merge_tags,
            commands::read_file,
            commands::write_file,
            commands::create_file,
            commands::delete_file,
            commands::move_file,
            commands::create_folder,
            commands::rename_folder,
            commands::delete_folder,
            commands::duplicate_file,
            commands::move_files,
            commands::git_log,
            commands::git_diff,
            commands::git_show_file,
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
            commands::update_config,
            commands::generate_commit_message,
            commands::commit_file,
            commands::get_api_key,
            commands::set_api_key,
            commands::delete_api_key,
            commands::run_prompt,
            commands::cancel_prompt,
            commands::export_file_clipboard,
            commands::export_folder_zip,
            commands::import_files,
            commands::import_from_text,
            commands::install_samples,
            commands::save_recovery,
            commands::clear_recovery,
            commands::load_recovery,
            commands::clear_all_recovery,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
