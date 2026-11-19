//! `settings.json` and `keybindings.json` in the user configuration folder (docs/SPEC.md §16).
//!
//! The frontend keeps the settings in memory and sends only the keys it changes ([`update_settings`]):
//! the file is read again before every write, so keys edited by hand in the meantime are kept.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::fs::atomic_write;
use super::themes::user_config_dir;

pub const SETTINGS_FILE: &str = "settings.json";
pub const KEYBINDINGS_FILE: &str = "keybindings.json";

/// Written when `keybindings.json` is opened for the first time. Keys starting with `//` are ignored.
const KEYBINDINGS_TEMPLATE: &str = r#"{
  "//": "Replace a default shortcut: \"bold\": \"Mod+Shift+B\" or [\"Mod+B\", \"F2\"]. null removes it. Mod = Ctrl (Cmd on macOS). Command names: https://github.com/follen99/MarkType/blob/main/docs/SHORTCUTS.md"
}
"#;

/// Serializes the read-modify-write cycles on `settings.json`.
#[derive(Default)]
pub struct SettingsLock(Mutex<()>);

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSettings {
    /// None when the file does not exist yet (first run: the frontend migrates its old preferences)
    /// or cannot be read.
    pub values: Option<Map<String, Value>>,
    /// The file exists but is not a valid JSON object: the app must not overwrite it.
    pub error: Option<String>,
    pub path: String,
}

/// The JSON object in `path`; Ok(None) if the file does not exist. An empty file is an empty object.
pub fn read_object(path: &Path) -> Result<Option<Map<String, Value>>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let text = text.trim_start_matches('\u{feff}');
    if text.trim().is_empty() {
        return Ok(Some(Map::new()));
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Ok(Some(map)),
        Ok(_) => Err("expected a JSON object: { ... }".into()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn load(path: &Path) -> LoadedSettings {
    let (values, error) = match read_object(path) {
        Ok(values) => (values, None),
        Err(error) => (None, Some(error)),
    };
    LoadedSettings {
        values,
        error,
        path: path.to_string_lossy().into_owned(),
    }
}

/// Applies `patch` to the file (a `null` value removes the key) and writes it back, pretty-printed and
/// atomically. Refuses to touch a file that is not valid JSON.
pub fn update(path: &Path, patch: Map<String, Value>) -> Result<(), String> {
    let mut values = read_object(path)
        .map_err(|e| format!("{}: {e}", path.display()))?
        .unwrap_or_default();
    for (key, value) in patch {
        if value.is_null() {
            values.remove(&key);
        } else {
            values.insert(key, value);
        }
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    }
    let mut text =
        serde_json::to_string_pretty(&Value::Object(values)).map_err(|e| e.to_string())?;
    text.push('\n');
    atomic_write(path, text.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))
}

fn config_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(user_config_dir(app)?.join(name))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<LoadedSettings, String> {
    Ok(load(&config_file(&app, SETTINGS_FILE)?))
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    lock: State<'_, SettingsLock>,
    patch: Map<String, Value>,
) -> Result<(), String> {
    let path = config_file(&app, SETTINGS_FILE)?;
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    update(&path, patch)
}

/// The user's shortcut overrides; an empty object when the file does not exist.
#[tauri::command]
pub fn read_keybindings(app: AppHandle) -> Result<Map<String, Value>, String> {
    let path = config_file(&app, KEYBINDINGS_FILE)?;
    read_object(&path)
        .map(Option::unwrap_or_default)
        .map_err(|e| format!("{KEYBINDINGS_FILE}: {e}"))
}

/// Opens `settings.json` or `keybindings.json` with the system editor, creating it first if needed.
#[tauri::command]
pub fn open_config_file(
    app: AppHandle,
    lock: State<'_, SettingsLock>,
    name: String,
) -> Result<(), String> {
    let (file, template) = match name.as_str() {
        "settings" => (SETTINGS_FILE, "{}\n"),
        "keybindings" => (KEYBINDINGS_FILE, KEYBINDINGS_TEMPLATE),
        _ => return Err(format!("Unknown configuration file: {name}")),
    };
    let path = config_file(&app, file)?;
    {
        let _guard = lock.0.lock().map_err(|e| e.to_string())?;
        if !path.exists() {
            if let Some(dir) = path.parent() {
                fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            atomic_write(&path, template.as_bytes()).map_err(|e| e.to_string())?;
        }
    }
    let target = path.to_string_lossy().into_owned();
    match app.opener().open_path(&target, None::<&str>) {
        Ok(()) => Ok(()),
        // No program associated with .json: Notepad is always there on Windows.
        Err(_) if cfg!(windows) => app
            .opener()
            .open_path(&target, Some("notepad.exe"))
            .map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn obj(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            _ => unreachable!(),
        }
    }

    #[test]
    fn missing_file_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = load(&dir.path().join(SETTINGS_FILE));
        assert_eq!(loaded.values, None);
        assert_eq!(loaded.error, None);
    }

    #[test]
    fn update_merges_and_keeps_hand_edits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join(SETTINGS_FILE);
        update(&path, obj(json!({ "autosave": true, "mode": "source" }))).unwrap();
        // Edited by hand while the app runs.
        fs::write(
            &path,
            "\u{feff}{ \"autosave\": true, \"mode\": \"source\", \"mine\": 1 }",
        )
        .unwrap();
        update(&path, obj(json!({ "autosave": false, "mode": null }))).unwrap();
        let values = load(&path).values.unwrap();
        assert_eq!(
            Value::Object(values),
            json!({ "autosave": false, "mine": 1 })
        );
        assert!(fs::read_to_string(&path).unwrap().ends_with("}\n"));
    }

    #[test]
    fn invalid_file_is_reported_and_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        fs::write(&path, "{ \"autosave\": tru").unwrap();
        let loaded = load(&path);
        assert!(loaded.values.is_none());
        assert!(loaded.error.is_some());
        assert!(update(&path, obj(json!({ "autosave": false }))).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ \"autosave\": tru");

        fs::write(&path, "[1, 2]").unwrap();
        assert!(load(&path).error.is_some());
    }

    #[test]
    fn empty_file_is_an_empty_object() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(KEYBINDINGS_FILE);
        fs::write(&path, "  \n").unwrap();
        assert_eq!(read_object(&path).unwrap(), Some(Map::new()));
    }

    #[test]
    fn keybindings_template_is_valid_json() {
        let value: Value = serde_json::from_str(KEYBINDINGS_TEMPLATE).unwrap();
        assert!(value.is_object());
    }
}
