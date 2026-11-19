//! Images pasted, dropped or inserted into a document. The frontend decides the folder and the file
//! name (docs/SPEC.md §10); this module only writes, and never replaces an existing file: when the name is
//! taken it picks `name-1.png`, `name-2.png`… (the file is created with `create_new`, so even a race with
//! another program cannot overwrite anything).

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

const MAX_SUFFIX: u32 = 10_000;

/// A plain file name: no folders, nothing that could escape `dir`.
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', '\0'])
        && !(cfg!(windows) && name.contains(':'))
}

fn split_name(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

/// Creates a new, empty file in `dir` (created if missing) named `name`, or `stem-1.ext`, `stem-2.ext`…
/// when that name is taken. Never opens an existing file.
pub fn create_free_file(dir: &Path, name: &str) -> io::Result<(PathBuf, File)> {
    if !valid_name(name) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("invalid file name {name:?}"),
        ));
    }
    fs::create_dir_all(dir)?;
    let (stem, ext) = split_name(name);
    for n in 0..MAX_SUFFIX {
        let candidate = if n == 0 {
            name.to_string()
        } else {
            format!("{stem}-{n}{ext}")
        };
        let path = dir.join(candidate);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            // Windows reports "access denied" when a folder has that name.
            Err(_) if path.exists() => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::other("no free file name"))
}

/// Writes `bytes` as a new file in `dir`; returns its path.
pub fn save(dir: &Path, name: &str, bytes: &[u8]) -> io::Result<PathBuf> {
    let (path, mut file) = create_free_file(dir, name)?;
    let written = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    if let Err(e) = written {
        let _ = fs::remove_file(&path);
        return Err(e);
    }
    Ok(path)
}

fn same_dir(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Moves the image at `source` into `dir` under a free name; returns the new path. An image already in
/// `dir` stays where it is.
pub fn move_into(source: &Path, dir: &Path) -> io::Result<PathBuf> {
    if !source.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("{} not found", source.display()),
        ));
    }
    if source.parent().is_some_and(|parent| same_dir(parent, dir)) {
        return Ok(source.to_path_buf());
    }
    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    // Reserve the name first, then replace the empty placeholder.
    let (target, file) = create_free_file(dir, &name)?;
    drop(file);
    if fs::rename(source, &target).is_ok() {
        return Ok(target);
    }
    // Different volume: copy, then remove the original.
    match fs::copy(source, &target) {
        Ok(_) => {
            let _ = fs::remove_file(source);
            Ok(target)
        }
        Err(e) => {
            let _ = fs::remove_file(&target);
            Err(e)
        }
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Decodes the `encodeURIComponent` header values sent by the frontend.
fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = value
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
                .ok_or_else(|| format!("bad escape in {value}"))?;
            out.push(hex);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("missing {name}"))?;
    percent_decode(value)
}

fn allow_dir(app: &AppHandle, dir: &Path) {
    let _ = app.asset_protocol_scope().allow_directory(dir, true);
}

fn pending_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("pending-images"))
}

/// Body: the image bytes. Headers `x-dir` and `x-name` (URI-encoded): destination folder and file name.
#[tauri::command]
pub async fn save_image(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let dir = PathBuf::from(header(&request, "x-dir")?);
    let name = header(&request, "x-name")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw image bytes".into());
    };
    let bytes = bytes.clone();
    let path = tauri::async_runtime::spawn_blocking({
        let dir = dir.clone();
        move || save(&dir, &name, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Cannot save the image in {}: {e}", dir.display()))?;
    allow_dir(&app, &dir);
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn move_image(app: AppHandle, path: PathBuf, dir: PathBuf) -> Result<String, String> {
    let target = tauri::async_runtime::spawn_blocking({
        let dir = dir.clone();
        move || move_into(&path, &dir)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Cannot move the image to {}: {e}", dir.display()))?;
    allow_dir(&app, &dir);
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_image_file(path: PathBuf) -> Result<Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        fs::read(&path).map_err(|e| format!("Cannot read {}: {e}", path.display()))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Response::new(bytes))
}

/// Folder holding the images of documents that were never saved (one subfolder per document).
#[tauri::command]
pub fn pending_images_root(app: AppHandle) -> Result<String, String> {
    let root = pending_root(&app)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    allow_dir(&app, &root);
    Ok(root.to_string_lossy().into_owned())
}

/// Deletes the pending images of an untitled document that was closed without saving.
#[tauri::command]
pub async fn discard_pending_images(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("invalid id {id}"));
    }
    let dir = pending_root(&app)?.join(id);
    tauri::async_runtime::spawn_blocking(move || match fs::remove_dir_all(&dir) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn saves_into_a_new_folder() {
        let dir = tempfile::tempdir().unwrap();
        let assets = dir.path().join("assets");
        let path = save(&assets, "image.png", b"png").unwrap();
        assert_eq!(path, assets.join("image.png"));
        assert_eq!(fs::read(path).unwrap(), b"png");
    }

    #[test]
    fn never_overwrites_and_adds_suffixes() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.png"), b"old").unwrap();
        let first = save(dir.path(), "a.png", b"new1").unwrap();
        let second = save(dir.path(), "a.png", b"new2").unwrap();
        assert_eq!(first, dir.path().join("a-1.png"));
        assert_eq!(second, dir.path().join("a-2.png"));
        assert_eq!(fs::read(dir.path().join("a.png")).unwrap(), b"old");
        assert_eq!(fs::read(first).unwrap(), b"new1");
        assert_eq!(fs::read(second).unwrap(), b"new2");
    }

    #[test]
    fn suffix_goes_before_the_extension_only() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("my.photo.jpg"), b"x").unwrap();
        fs::write(dir.path().join("noext"), b"x").unwrap();
        assert_eq!(
            save(dir.path(), "my.photo.jpg", b"y").unwrap(),
            dir.path().join("my.photo-1.jpg")
        );
        assert_eq!(
            save(dir.path(), "noext", b"y").unwrap(),
            dir.path().join("noext-1")
        );
    }

    #[test]
    fn skips_names_taken_by_folders() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("pic.png")).unwrap();
        assert_eq!(
            save(dir.path(), "pic.png", b"y").unwrap(),
            dir.path().join("pic-1.png")
        );
    }

    #[test]
    fn rejects_names_that_could_escape_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["../x.png", "a/b.png", "a\\b.png", "..", ""] {
            assert!(save(dir.path(), name, b"y").is_err(), "{name}");
        }
        assert!(names(dir.path()).is_empty());
    }

    #[test]
    fn moves_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let pending = dir.path().join("pending");
        let assets = dir.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(assets.join("shot.png"), b"existing").unwrap();
        let source = save(&pending, "shot.png", b"pasted").unwrap();
        let moved = move_into(&source, &assets).unwrap();
        assert_eq!(moved, assets.join("shot-1.png"));
        assert_eq!(fs::read(&moved).unwrap(), b"pasted");
        assert_eq!(fs::read(assets.join("shot.png")).unwrap(), b"existing");
        assert!(!source.exists());
    }

    #[test]
    fn move_into_the_same_folder_keeps_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let source = save(dir.path(), "a.png", b"x").unwrap();
        assert_eq!(move_into(&source, dir.path()).unwrap(), source);
        assert_eq!(names(dir.path()), ["a.png"]);
    }

    #[test]
    fn decodes_uri_components() {
        assert_eq!(
            percent_decode("C%3A%5CUsers%5Cme%5Cmy%20notes%5C%C3%A0").unwrap(),
            "C:\\Users\\me\\my notes\\à"
        );
        assert!(percent_decode("%zz").is_err());
    }
}
