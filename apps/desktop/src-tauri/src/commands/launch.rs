//! Files and folders to open from outside the app (docs/SPEC.md §14): the command line
//! (`marktype file.md`, `marktype ./folder`), a double click on a `.md` file, "Open with MarkType", and a
//! second launch while MarkType is already open (single instance: the paths go to the running window).
//!
//! Paths that arrive before the frontend asked for them ([`take_launch_paths`]) wait in [`LaunchState`];
//! later ones are sent with the [`OPEN_PATHS`] event.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Event carrying a `Vec<LaunchPath>` to open in the running window.
pub const OPEN_PATHS: &str = "open-paths";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPath {
    pub path: String,
    pub is_dir: bool,
}

#[derive(Default)]
pub struct LaunchState(Mutex<Launch>);

#[derive(Default)]
struct Launch {
    ready: bool,
    pending: Vec<LaunchPath>,
}

/// Removes `.` and `..` without touching the disk (`canonicalize` would add `\\?\` on Windows).
fn clean(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push(component);
                }
            }
            other => out.push(other),
        }
    }
    out
}

/// An existing file or folder named by `arg` (relative to `cwd`, or a `file://` URL); None otherwise.
pub fn launch_path(arg: &str, cwd: &Path) -> Option<LaunchPath> {
    let arg = arg.trim();
    if arg.is_empty() || arg.starts_with('-') {
        return None;
    }
    let path = if arg.starts_with("file://") {
        tauri::Url::parse(arg).ok()?.to_file_path().ok()?
    } else {
        PathBuf::from(arg)
    };
    let path = clean(&if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    });
    let meta = fs::metadata(&path).ok()?;
    Some(LaunchPath {
        path: path.to_string_lossy().into_owned(),
        is_dir: meta.is_dir(),
    })
}

/// The paths among command-line arguments (without the program name).
pub fn paths_from_args<I, S>(args: I, cwd: &Path) -> Vec<LaunchPath>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .filter_map(|arg| launch_path(arg.as_ref(), cwd))
        .collect()
}

/// Queues the paths until the frontend is ready, then sends them to the main window and brings it forward.
pub fn deliver(app: &AppHandle, paths: Vec<LaunchPath>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    if paths.is_empty() {
        return;
    }
    let state = app.state::<LaunchState>();
    let Ok(mut launch) = state.0.lock() else {
        return;
    };
    if launch.ready {
        drop(launch);
        let _ = app.emit_to("main", OPEN_PATHS, paths);
    } else {
        launch.pending.extend(paths);
    }
}

/// Paths given at startup. From now on, new ones arrive as [`OPEN_PATHS`] events.
#[tauri::command]
pub fn take_launch_paths(state: State<'_, LaunchState>) -> Result<Vec<LaunchPath>, String> {
    let mut launch = state.0.lock().map_err(|e| e.to_string())?;
    launch.ready = true;
    Ok(std::mem::take(&mut launch.pending))
}

/// Called by the single-instance plugin in the first instance when MarkType is launched again.
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let paths = paths_from_args(argv.iter().skip(1), Path::new(&cwd));
    deliver(app, paths);
}

/// Startup arguments of this process.
pub fn initial_state() -> LaunchState {
    let cwd = std::env::current_dir().unwrap_or_default();
    let pending = paths_from_args(std::env::args().skip(1), &cwd);
    LaunchState(Mutex::new(Launch {
        ready: false,
        pending,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_files_and_folders_only() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("note.md"), "# hi").unwrap();
        fs::create_dir(dir.path().join("notes")).unwrap();
        let found = paths_from_args(
            [
                "note.md",
                "--flag",
                "missing.md",
                "notes",
                "",
                "./notes/../note.md",
            ],
            dir.path(),
        );
        let expected_file = dir.path().join("note.md").to_string_lossy().into_owned();
        assert_eq!(
            found,
            vec![
                LaunchPath {
                    path: expected_file.clone(),
                    is_dir: false
                },
                LaunchPath {
                    path: dir.path().join("notes").to_string_lossy().into_owned(),
                    is_dir: true
                },
                LaunchPath {
                    path: expected_file,
                    is_dir: false
                },
            ]
        );
    }

    #[test]
    fn absolute_paths_and_file_urls() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a b.md");
        fs::write(&file, "").unwrap();
        let other = tempfile::tempdir().unwrap();
        let absolute = launch_path(&file.to_string_lossy(), other.path()).unwrap();
        assert_eq!(absolute.path, file.to_string_lossy());
        let url = tauri::Url::from_file_path(&file).unwrap();
        let from_url = launch_path(url.as_str(), other.path()).unwrap();
        assert_eq!(PathBuf::from(from_url.path), file);
    }

    #[test]
    fn clean_resolves_dots() {
        let base = if cfg!(windows) { "C:\\a\\b" } else { "/a/b" };
        let cleaned = clean(&Path::new(base).join("..").join(".").join("c.md"));
        let expected = if cfg!(windows) {
            "C:\\a\\c.md"
        } else {
            "/a/c.md"
        };
        assert_eq!(cleaned, PathBuf::from(expected));
    }
}
