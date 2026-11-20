//! Folder browsing and file management for the sidebar.

use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mkdn", "mdx"];
const MAX_FILES: usize = 20_000;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| MARKDOWN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Folders first, then case-insensitive natural order ("note 2" before "note 10").
fn compare_entries(a: &DirEntry, b: &DirEntry) -> Ordering {
    b.is_dir
        .cmp(&a.is_dir)
        .then_with(|| natural_cmp(&a.name.to_lowercase(), &b.name.to_lowercase()))
}

fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut s = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        s.push(c);
                        it.next();
                    }
                    s
                };
                let (na, nb) = (take(&mut a), take(&mut b));
                let ord = na
                    .trim_start_matches('0')
                    .len()
                    .cmp(&nb.trim_start_matches('0').len())
                    .then_with(|| na.trim_start_matches('0').cmp(nb.trim_start_matches('0')));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            (Some(x), Some(y)) => {
                if x != y {
                    return x.cmp(&y);
                }
                a.next();
                b.next();
            }
        }
    }
}

/// Lists one level of a folder: sub-folders and markdown files, hidden entries skipped.
pub fn list_entries(dir: &Path) -> Result<Vec<DirEntry>, String> {
    let read = fs::read_dir(dir).map_err(|e| format!("Cannot open {}: {e}", dir.display()))?;
    let mut entries: Vec<DirEntry> = read
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_hidden(&name) {
                return None;
            }
            let path = entry.path();
            let is_dir = entry.file_type().ok()?.is_dir() || path.is_dir();
            (is_dir || is_markdown(&path)).then(|| DirEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir,
            })
        })
        .collect();
    entries.sort_by(compare_entries);
    Ok(entries)
}

/// Every markdown file under `root` (respects .gitignore, skips hidden folders), for quick open.
pub fn markdown_files(root: &Path) -> Vec<String> {
    ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .require_git(false)
        .build()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()) && is_markdown(e.path()))
        .take(MAX_FILES)
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect()
}

fn validate_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    let invalid = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        || name.chars().any(char::is_control);
    if invalid {
        Err(format!("“{name}” is not a valid file name"))
    } else {
        Ok(name)
    }
}

fn ensure_free(path: &Path) -> Result<(), String> {
    if path.exists() {
        Err(format!("{} already exists", path.display()))
    } else {
        Ok(())
    }
}

pub fn create_file(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let path = dir.join(validate_name(name)?);
    ensure_free(&path)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| format!("Cannot create {}: {e}", path.display()))?;
    Ok(path)
}

pub fn create_folder(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let path = dir.join(validate_name(name)?);
    ensure_free(&path)?;
    fs::create_dir(&path).map_err(|e| format!("Cannot create {}: {e}", path.display()))?;
    Ok(path)
}

pub fn rename(path: &Path, new_name: &str) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("Cannot rename the root folder")?;
    let target = parent.join(validate_name(new_name)?);
    // Case-only renames ("note.md" → "Note.md") are allowed on case-insensitive file systems.
    let same_file =
        target.to_string_lossy().to_lowercase() == path.to_string_lossy().to_lowercase();
    if !same_file {
        ensure_free(&target)?;
    }
    fs::rename(path, &target).map_err(|e| format!("Cannot rename {}: {e}", path.display()))?;
    Ok(target)
}

pub fn move_into(path: &Path, target_dir: &Path) -> Result<PathBuf, String> {
    let name = path.file_name().ok_or("Invalid path")?;
    if target_dir.starts_with(path) {
        return Err("A folder cannot be moved inside itself".into());
    }
    let target = target_dir.join(name);
    if target == path {
        return Ok(target);
    }
    ensure_free(&target)?;
    fs::rename(path, &target).map_err(|e| format!("Cannot move {}: {e}", path.display()))?;
    Ok(target)
}

// ---------- commands ----------

/// Runs blocking file-system work off the async runtime.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

#[tauri::command]
pub async fn list_dir(app: AppHandle, path: PathBuf) -> Result<Vec<DirEntry>, String> {
    // Images next to any listed document can be displayed.
    let _ = app.asset_protocol_scope().allow_directory(&path, false);
    blocking(move || list_entries(&path)).await
}

#[tauri::command]
pub async fn open_folder(app: AppHandle, path: PathBuf) -> Result<Vec<DirEntry>, String> {
    let _ = app.asset_protocol_scope().allow_directory(&path, true);
    blocking(move || list_entries(&path)).await
}

#[tauri::command]
pub async fn list_markdown_files(root: PathBuf) -> Result<Vec<String>, String> {
    blocking(move || Ok(markdown_files(&root))).await
}

#[tauri::command]
pub async fn create_file_in(dir: PathBuf, name: String) -> Result<String, String> {
    blocking(move || create_file(&dir, &name).map(path_string)).await
}

#[tauri::command]
pub async fn create_folder_in(dir: PathBuf, name: String) -> Result<String, String> {
    blocking(move || create_folder(&dir, &name).map(path_string)).await
}

#[tauri::command]
pub async fn rename_path(path: PathBuf, new_name: String) -> Result<String, String> {
    blocking(move || rename(&path, &new_name).map(path_string)).await
}

#[tauri::command]
pub async fn move_path(path: PathBuf, target_dir: PathBuf) -> Result<String, String> {
    blocking(move || move_into(&path, &target_dir).map(path_string)).await
}

#[tauri::command]
pub async fn trash_path(path: PathBuf) -> Result<(), String> {
    blocking(move || {
        trash::delete(&path)
            .map_err(|e| format!("Cannot move {} to the trash: {e}", path.display()))
    })
    .await
}

/// "file", "dir" or None when nothing is at `path` (used to skip deleted files and folders).
#[tauri::command]
pub async fn path_kind(path: PathBuf) -> Result<Option<&'static str>, String> {
    blocking(move || Ok(kind_of(&path))).await
}

fn kind_of(path: &Path) -> Option<&'static str> {
    std::fs::metadata(path)
        .ok()
        .map(|meta| if meta.is_dir() { "dir" } else { "file" })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(entries: &[DirEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn lists_folders_first_then_markdown_in_natural_order() {
        let dir = tempfile::tempdir().unwrap();
        for f in [
            "note 10.md",
            "note 2.md",
            "Readme.MD",
            "image.png",
            ".hidden.md",
        ] {
            fs::write(dir.path().join(f), "").unwrap();
        }
        fs::create_dir(dir.path().join("zeta")).unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        let entries = list_entries(dir.path()).unwrap();
        assert_eq!(
            names(&entries),
            ["zeta", "note 2.md", "note 10.md", "Readme.MD"]
        );
    }

    #[test]
    fn walks_markdown_files_respecting_gitignore() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("docs/deep")).unwrap();
        fs::create_dir_all(dir.path().join("build")).unwrap();
        fs::write(dir.path().join("docs/deep/a.md"), "").unwrap();
        fs::write(dir.path().join("build/b.md"), "").unwrap();
        fs::write(dir.path().join(".gitignore"), "build/\n").unwrap();
        let files = markdown_files(dir.path());
        assert_eq!(files.len(), 1);
        assert!(files[0].ends_with("a.md"));
    }

    #[test]
    fn creates_renames_and_moves_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let file = create_file(dir.path(), "a.md").unwrap();
        assert!(create_file(dir.path(), "a.md").is_err());
        assert!(create_file(dir.path(), "../evil.md").is_err());
        let sub = create_folder(dir.path(), "sub").unwrap();
        let renamed = rename(&file, "b.md").unwrap();
        assert!(renamed.ends_with("b.md"));
        let moved = move_into(&renamed, &sub).unwrap();
        assert!(moved.starts_with(&sub) && moved.exists());
        assert!(move_into(&sub, &sub).is_err());
    }

    #[test]
    fn allows_case_only_rename() {
        let dir = tempfile::tempdir().unwrap();
        let file = create_file(dir.path(), "note.md").unwrap();
        let renamed = rename(&file, "Note.md").unwrap();
        assert!(renamed.ends_with("Note.md"));
    }

    #[test]
    fn tells_files_from_folders_and_missing_paths() {
        let dir = tempfile::tempdir().unwrap();
        let file = create_file(dir.path(), "note.md").unwrap();
        assert_eq!(kind_of(dir.path()), Some("dir"));
        assert_eq!(kind_of(&file), Some("file"));
        assert_eq!(kind_of(&dir.path().join("gone.md")), None);
    }
}
