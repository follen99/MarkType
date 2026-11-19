//! User themes: Typora-compatible `.css` files in `<config dir>/themes` (docs/THEMES.md).
//!
//! The frontend loads them as `<link>` elements through the asset protocol, so `url('./my-theme/font.woff')`
//! inside a theme resolves next to the CSS file. A file watcher emits [`THEMES_CHANGED`] for live reload.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Event emitted (no payload) whenever something changes in the themes folder.
pub const THEMES_CHANGED: &str = "themes-changed";

/// File applied on top of every theme.
const BASE_USER_CSS: &str = "base.user.css";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeInfo {
    /// File stem, e.g. `my-theme` for `my-theme.css`. Unique within the folder.
    pub id: String,
    pub name: String,
    pub path: String,
    pub dark: bool,
    /// `<id>.user.css`, if present.
    pub user_css: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeList {
    pub dir: String,
    pub themes: Vec<ThemeInfo>,
    pub base_user_css: Option<String>,
}

/// The parts of `<id>.meta.json` that matter here.
#[derive(Debug, Default, Deserialize)]
pub struct ThemeMeta {
    pub name: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Keeps the watcher alive; replaced when the frontend asks to watch again.
#[derive(Default)]
pub struct ThemeWatcher(Mutex<Option<RecommendedWatcher>>);

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// "my-theme" / "my_theme" → "My Theme".
pub fn display_name(id: &str) -> String {
    id.split(['-', '_', ' '])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Relative luminance (0–1) of a `#rgb` / `#rrggbb` colour, or None for anything else.
fn hex_luminance(value: &str) -> Option<f64> {
    let hex = value.trim().strip_prefix('#')?;
    let expanded: String = match hex.len() {
        3 | 4 => hex.chars().take(3).flat_map(|c| [c, c]).collect(),
        6 | 8 => hex[..6].to_string(),
        _ => return None,
    };
    let channel = |i: usize| {
        u8::from_str_radix(&expanded[i..i + 2], 16)
            .ok()
            .map(|v| f64::from(v) / 255.0)
    };
    let (r, g, b) = (channel(0)?, channel(2)?, channel(4)?);
    Some(0.2126 * r + 0.7152 * g + 0.0722 * b)
}

/// Guesses whether a theme is dark: meta tags first, then the name, then the `--bg-color` it declares.
pub fn is_dark(id: &str, css: &str, meta: &ThemeMeta) -> bool {
    if meta.tags.iter().any(|t| t.eq_ignore_ascii_case("dark")) {
        return true;
    }
    if meta.tags.iter().any(|t| t.eq_ignore_ascii_case("light")) {
        return false;
    }
    let lower = id.to_ascii_lowercase();
    if ["dark", "night", "black", "dracula", "monokai"]
        .iter()
        .any(|w| lower.contains(w))
    {
        return true;
    }
    css.split("--bg-color")
        .skip(1)
        .find_map(|rest| {
            let value = rest.trim_start().strip_prefix(':')?;
            let end = value.find([';', '}', '!']).unwrap_or(value.len());
            hex_luminance(&value[..end])
        })
        .is_some_and(|l| l < 0.4)
}

fn read_meta(dir: &Path, id: &str) -> ThemeMeta {
    let meta: ThemeMeta = fs::read_to_string(dir.join(format!("{id}.meta.json")))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    ThemeMeta {
        name: meta.name.filter(|n| !n.trim().is_empty()),
        tags: meta.tags,
    }
}

/// Lists the themes in `dir` (not recursive), sorted by name. A missing folder is an empty list.
pub fn list(dir: &Path) -> ThemeList {
    let mut themes = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("css") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            // `base.user.css` and `<theme>.user.css` are overrides, not themes.
            if id.ends_with(".user") {
                continue;
            }
            let css = fs::read_to_string(&path).unwrap_or_default();
            let meta = read_meta(dir, id);
            let user_css = dir.join(format!("{id}.user.css"));
            themes.push(ThemeInfo {
                id: id.to_string(),
                name: meta.name.clone().unwrap_or_else(|| display_name(id)),
                path: path_string(&path),
                dark: is_dark(id, &css, &meta),
                user_css: user_css.is_file().then(|| path_string(&user_css)),
            });
        }
    }
    themes.sort_by_key(|t| t.name.to_lowercase());
    let base_user = dir.join(BASE_USER_CSS);
    ThemeList {
        dir: path_string(dir),
        themes,
        base_user_css: base_user.is_file().then(|| path_string(&base_user)),
    }
}

/// User-editable configuration folder with a readable name (docs/THEMES.md, SPEC §16):
/// `%APPDATA%\MarkType`, `~/Library/Application Support/MarkType`, `~/.config/marktype`.
/// (Tauri's `app_config_dir` would use the bundle identifier instead.)
pub fn user_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "linux") {
        "marktype"
    } else {
        "MarkType"
    };
    Ok(app
        .path()
        .config_dir()
        .map_err(|e| e.to_string())?
        .join(name))
}

fn themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = user_config_dir(app)?.join("themes");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[tauri::command]
pub async fn list_themes(app: AppHandle) -> Result<ThemeList, String> {
    let dir = themes_dir(&app)?;
    // Themes and the fonts/images next to them are loaded through the asset protocol.
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    tauri::async_runtime::spawn_blocking(move || list(&dir))
        .await
        .map_err(|e| e.to_string())
}

/// Starts (or restarts) watching the themes folder; changes emit [`THEMES_CHANGED`].
#[tauri::command]
pub fn watch_themes(app: AppHandle, state: State<'_, ThemeWatcher>) -> Result<(), String> {
    let dir = themes_dir(&app)?;
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event
            && !event.kind.is_access()
        {
            let _ = handle.emit(THEMES_CHANGED, ());
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn open_themes_folder(app: AppHandle) -> Result<(), String> {
    let dir = themes_dir(&app)?;
    app.opener()
        .open_path(path_string(&dir), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, text: &str) {
        fs::write(dir.join(name), text).unwrap();
    }

    #[test]
    fn names_from_file_stems() {
        assert_eq!(display_name("my-theme"), "My Theme");
        assert_eq!(display_name("github_night"), "Github Night");
        assert_eq!(display_name("vue"), "Vue");
    }

    #[test]
    fn detects_dark_themes() {
        let none = ThemeMeta::default();
        assert!(is_dark("onedark", "", &none));
        assert!(is_dark("plain", ":root { --bg-color: #1e1e1e; }", &none));
        assert!(is_dark("plain", ":root{--bg-color:#000}", &none));
        assert!(!is_dark("plain", ":root { --bg-color: #ffffff; }", &none));
        assert!(!is_dark("plain", ":root { --bg-color: var(--x); }", &none));
        let tagged = ThemeMeta {
            name: None,
            tags: vec!["Dark".into()],
        };
        assert!(is_dark("plain", "", &tagged));
        let light = ThemeMeta {
            name: None,
            tags: vec!["light".into()],
        };
        assert!(!is_dark("night-owl", "", &light));
    }

    #[test]
    fn lists_themes_and_user_overrides() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        write(d, "vue.css", ":root { --bg-color: #fff; }");
        write(d, "my-night.css", "");
        write(d, "my-night.user.css", "");
        write(d, "base.user.css", "");
        write(d, "notes.txt", "");
        write(
            d,
            "vue.meta.json",
            r#"{ "name": "Vue Theme", "tags": ["light"] }"#,
        );
        fs::create_dir(d.join("vue")).unwrap();
        write(&d.join("vue"), "font.css", "");

        let list = list(d);
        let ids: Vec<_> = list.themes.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["my-night", "vue"]);
        assert_eq!(list.themes[0].name, "My Night");
        assert!(list.themes[0].dark);
        assert!(
            list.themes[0]
                .user_css
                .as_deref()
                .unwrap()
                .ends_with("my-night.user.css")
        );
        assert_eq!(list.themes[1].name, "Vue Theme");
        assert!(!list.themes[1].dark);
        assert!(list.themes[1].user_css.is_none());
        assert!(list.base_user_css.unwrap().ends_with("base.user.css"));
    }

    #[test]
    fn missing_folder_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let list = list(&dir.path().join("nope"));
        assert!(list.themes.is_empty());
        assert!(list.base_user_css.is_none());
    }
}
