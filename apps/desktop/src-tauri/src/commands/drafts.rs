//! Unsaved changes are mirrored here while editing, so they can be recovered after a crash.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::fs::atomic_write;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    /// Path of the document, or None for an untitled one.
    pub path: Option<String>,
    pub name: String,
    pub text: String,
    pub saved_at: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn draft_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if valid_id(id) {
        Ok(dir.join(format!("{id}.json")))
    } else {
        Err(format!("invalid draft id {id}"))
    }
}

pub fn save(dir: &Path, draft: &Draft) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_vec(draft).map_err(|e| e.to_string())?;
    atomic_write(&draft_path(dir, &draft.id)?, &json).map_err(|e| e.to_string())
}

pub fn remove(dir: &Path, id: &str) -> Result<(), String> {
    match fs::remove_file(draft_path(dir, id)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

pub fn list(dir: &Path) -> Vec<Draft> {
    let Ok(read) = fs::read_dir(dir) else {
        return vec![];
    };
    let mut drafts: Vec<Draft> = read
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_slice(&fs::read(e.path()).ok()?).ok())
        .collect();
    drafts.sort_by_key(|d| d.saved_at);
    drafts
}

fn drafts_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("drafts"))
}

#[tauri::command]
pub async fn save_draft(app: AppHandle, draft: Draft) -> Result<(), String> {
    let dir = drafts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || save(&dir, &draft))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_draft(app: AppHandle, id: String) -> Result<(), String> {
    let dir = drafts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove(&dir, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_drafts(app: AppHandle) -> Result<Vec<Draft>, String> {
    let dir = drafts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || Ok(list(&dir)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(id: &str, saved_at: u64) -> Draft {
        Draft {
            id: id.into(),
            path: None,
            name: "Untitled".into(),
            text: "hi".into(),
            saved_at,
        }
    }

    #[test]
    fn saves_lists_and_removes_drafts() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &draft("b-2", 2)).unwrap();
        save(dir.path(), &draft("a-1", 1)).unwrap();
        let ids: Vec<_> = list(dir.path()).into_iter().map(|d| d.id).collect();
        assert_eq!(ids, ["a-1", "b-2"]);
        remove(dir.path(), "a-1").unwrap();
        remove(dir.path(), "a-1").unwrap();
        assert_eq!(list(dir.path()).len(), 1);
    }

    #[test]
    fn rejects_ids_that_could_escape_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert!(save(dir.path(), &draft("../x", 1)).is_err());
    }
}
