//! MarkType desktop core. Commands live in [`commands`]; each module maps to one area of
//! `docs/ARCHITECTURE.md` (fs, images, search, recovery, settings, themes, export).

mod commands;

/// Builds and runs the Tauri application.
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app::app_info])
        .run(tauri::generate_context!())
        .expect("error while running MarkType");
}
