//! Text file I/O for documents: UTF-8 reads, atomic writes and detection of external changes.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

/// Identifies a version of a file on disk. If it differs from the one recorded at load time,
/// the file was changed by someone else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStamp {
    pub modified_ms: u64,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub text: String,
    pub stamp: FileStamp,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum WriteResult {
    Ok {
        stamp: FileStamp,
    },
    /// The file changed on disk since it was read; nothing was written.
    Conflict {
        current: Option<FileStamp>,
    },
}

pub fn stamp_of(path: &Path) -> io::Result<FileStamp> {
    let meta = fs::metadata(path)?;
    let modified_ms = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileStamp {
        modified_ms,
        size: meta.len(),
    })
}

pub fn read_text(path: &Path) -> Result<ReadResult, String> {
    let bytes = fs::read(path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let stamp = stamp_of(path).map_err(|e| e.to_string())?;
    let text = String::from_utf8(bytes)
        .map_err(|_| format!("{} is not a UTF-8 text file", path.display()))?;
    Ok(ReadResult { text, stamp })
}

fn temp_path_for(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let nanos = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    path.with_file_name(format!(".{name}.{}-{nanos}.mt-tmp", std::process::id()))
}

/// Writes `data` to a temporary file next to `path`, flushes it, then renames it over `path`, so a
/// crash or a full disk never leaves a half-written document.
pub fn atomic_write(path: &Path, data: &[u8]) -> io::Result<()> {
    let tmp = temp_path_for(path);
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        if let Ok(meta) = fs::metadata(path) {
            fs::set_permissions(&tmp, meta.permissions())?;
        }
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
        // Some sync tools / antivirus lock the target against replacement: fall back to an in-place write.
        if let Err(err) = &result
            && err.kind() == io::ErrorKind::PermissionDenied
            && path.exists()
        {
            return fs::write(path, data);
        }
    }
    result
}

pub fn write_text(
    path: &Path,
    text: &str,
    expected: Option<FileStamp>,
) -> Result<WriteResult, String> {
    if let Some(expected) = expected {
        let current = stamp_of(path).ok();
        if current != Some(expected) {
            return Ok(WriteResult::Conflict { current });
        }
    }
    atomic_write(path, text.as_bytes())
        .map_err(|e| format!("Cannot save {}: {e}", path.display()))?;
    let stamp = stamp_of(path).map_err(|e| e.to_string())?;
    Ok(WriteResult::Ok { stamp })
}

/// Lets the webview load images that sit next to the document (asset protocol).
fn allow_assets_near(app: &AppHandle, path: &Path) {
    if let Some(dir) = path.parent() {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
}

#[tauri::command]
pub async fn read_text_file(app: AppHandle, path: PathBuf) -> Result<ReadResult, String> {
    let result = tauri::async_runtime::spawn_blocking({
        let path = path.clone();
        move || read_text(&path)
    })
    .await
    .map_err(|e| e.to_string())??;
    allow_assets_near(&app, &path);
    Ok(result)
}

#[tauri::command]
pub async fn write_text_file(
    app: AppHandle,
    path: PathBuf,
    text: String,
    expected: Option<FileStamp>,
) -> Result<WriteResult, String> {
    let result = tauri::async_runtime::spawn_blocking({
        let path = path.clone();
        move || write_text(&path, &text, expected)
    })
    .await
    .map_err(|e| e.to_string())??;
    allow_assets_near(&app, &path);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let WriteResult::Ok { stamp } = write_text(&path, "# Title\n", None).unwrap() else {
            panic!("expected ok");
        };
        let read = read_text(&path).unwrap();
        assert_eq!(read.text, "# Title\n");
        assert_eq!(read.stamp, stamp);
    }

    #[test]
    fn replaces_existing_file_without_leaving_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "old").unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        let entries: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn refuses_to_overwrite_a_file_changed_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        let stale = FileStamp {
            modified_ms: 1,
            size: 2,
        };
        let result = write_text(&path, "mine", Some(stale)).unwrap();
        assert!(matches!(result, WriteResult::Conflict { current: Some(_) }));
        assert_eq!(fs::read_to_string(&path).unwrap(), "v1");
    }

    #[test]
    fn reports_conflict_when_the_file_was_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("gone.md");
        let stamp = FileStamp {
            modified_ms: 1,
            size: 1,
        };
        assert_eq!(
            write_text(&path, "x", Some(stamp)).unwrap(),
            WriteResult::Conflict { current: None }
        );
    }

    #[test]
    fn rejects_non_utf8_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("latin1.md");
        fs::write(&path, [0x63, 0x61, 0x66, 0xe9]).unwrap();
        assert!(read_text(&path).unwrap_err().contains("UTF-8"));
    }
}
