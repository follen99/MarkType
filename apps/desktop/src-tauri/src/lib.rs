//! MarkType desktop core. Commands live in [`commands`]; each module maps to one area of
//! `docs/ARCHITECTURE.md` (fs, folder, search, drafts, and later images, settings, themes, export).

mod commands;

use commands::{app, drafts, folder, fs, search, themes};

/// Builds and runs the Tauri application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(themes::ThemeWatcher::default())
        .invoke_handler(tauri::generate_handler![
            app::app_info,
            fs::read_text_file,
            fs::write_text_file,
            folder::open_folder,
            folder::list_dir,
            folder::list_markdown_files,
            folder::create_file_in,
            folder::create_folder_in,
            folder::rename_path,
            folder::move_path,
            folder::trash_path,
            search::search_folder,
            drafts::save_draft,
            drafts::remove_draft,
            drafts::list_drafts,
            themes::list_themes,
            themes::watch_themes,
            themes::open_themes_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkType");
}
