//! MarkType desktop core. Commands live in [`commands`]; each module maps to one area of
//! `docs/ARCHITECTURE.md` (fs, folder, search, drafts, images, settings, themes, launch, export).

mod commands;

use commands::{app, drafts, export, folder, fs, images, launch, pdf, search, settings, themes};

/// Builds and runs the Tauri application.
pub fn run() {
    let app = tauri::Builder::default()
        // First: a second launch hands its arguments to this instance and exits.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            launch::on_second_instance(app, argv, cwd);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(themes::ThemeWatcher::default())
        .manage(settings::SettingsLock::default())
        .manage(launch::initial_state())
        // The window is created here, not from tauri.conf.json ("create": false), because its WebView2
        // flags depend on settings.json (hardware acceleration).
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("missing main window config")?;
            let builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            #[cfg(windows)]
            let builder =
                builder.additional_browser_args(settings::startup_webview_args(app.handle()));
            builder.build()?;
            Ok(())
        })
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
            folder::path_kind,
            search::search_folder,
            drafts::save_draft,
            drafts::remove_draft,
            drafts::list_drafts,
            themes::list_themes,
            themes::watch_themes,
            themes::open_themes_folder,
            images::save_image,
            images::move_image,
            images::read_image_file,
            images::pending_images_root,
            images::discard_pending_images,
            settings::load_settings,
            settings::update_settings,
            settings::read_keybindings,
            settings::open_config_file,
            launch::take_launch_paths,
            export::pandoc_version,
            export::pandoc_export,
            export::open_export,
            pdf::print_pdf,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MarkType");

    app.run(|handle, event| {
        // Finder: double click on a .md file, "Open with", drop on the Dock icon.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &event {
            let paths = urls
                .iter()
                .filter_map(|url| launch::launch_path(url.as_str(), std::path::Path::new("/")))
                .collect();
            launch::deliver(handle, paths);
        }
        let _ = (handle, event);
    });
}
