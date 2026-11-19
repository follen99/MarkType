//! Export (docs/SPEC.md §13). HTML and PDF are produced by the frontend; this module runs Pandoc, when it
//! is installed, for Word, OpenDocument, RTF, EPUB and LaTeX, and opens the exported file.

use serde::Deserialize;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Error text the frontend recognises to explain how to install Pandoc.
pub const PANDOC_NOT_FOUND: &str = "pandoc-not-found";

/// Pandoc output formats offered by the app, as `-t` values.
const FORMATS: &[&str] = &["docx", "odt", "rtf", "epub", "latex"];

/// Extensions of the files the app exports (the only ones [`open_export`] opens).
const EXPORT_EXTENSIONS: &[&str] = &["html", "htm", "pdf", "docx", "odt", "rtf", "epub", "tex"];

fn pandoc_command(pandoc: &str) -> Command {
    let program = if pandoc.trim().is_empty() {
        "pandoc"
    } else {
        pandoc.trim()
    };
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window flashing on screen.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn spawn_error(error: io::Error) -> String {
    if error.kind() == io::ErrorKind::NotFound {
        PANDOC_NOT_FOUND.to_string()
    } else {
        error.to_string()
    }
}

/// First line of `pandoc --version` ("pandoc 3.6.2"), or None if it cannot be run.
pub fn version(pandoc: &str) -> Option<String> {
    let output = pandoc_command(pandoc)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(|line| line.trim().to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PandocJob {
    /// Program to run (`pandoc` = look it up in PATH).
    pub pandoc: String,
    pub markdown: String,
    /// One of [`FORMATS`].
    pub format: String,
    pub output: PathBuf,
    /// Folder of the document: relative image paths are resolved from here.
    pub resource_dir: Option<PathBuf>,
}

/// Arguments for `job` (the markdown goes to stdin).
pub fn pandoc_args(job: &PandocJob) -> Result<Vec<String>, String> {
    if !FORMATS.contains(&job.format.as_str()) {
        return Err(format!("Unsupported format: {}", job.format));
    }
    let mut args = vec![
        "--from=markdown".to_string(),
        format!("--to={}", job.format),
        "--standalone".to_string(),
        format!("--output={}", job.output.display()),
    ];
    if let Some(dir) = &job.resource_dir {
        args.push(format!("--resource-path={}", dir.display()));
    }
    if job.format == "epub" {
        // EPUB needs a title; the file name is a good default (front matter `title:` wins).
        if let Some(stem) = job.output.file_stem() {
            args.push(format!("--metadata=title:{}", stem.to_string_lossy()));
        }
    }
    Ok(args)
}

pub fn run_pandoc(job: &PandocJob) -> Result<(), String> {
    let args = pandoc_args(job)?;
    let mut command = pandoc_command(&job.pandoc);
    command
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(dir) = job.resource_dir.as_deref().filter(|d| d.is_dir()) {
        command.current_dir(dir);
    }
    let mut child = command.spawn().map_err(spawn_error)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(job.markdown.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("pandoc exited with {}", output.status)
        } else {
            stderr
        })
    }
}

#[tauri::command]
pub async fn pandoc_version(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || version(&path))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn pandoc_export(job: PandocJob) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_pandoc(&job))
        .await
        .map_err(|e| e.to_string())?
}

fn is_export_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXPORT_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Opens an exported file with its default program.
#[tauri::command]
pub fn open_export(app: AppHandle, path: PathBuf) -> Result<(), String> {
    if !is_export_file(&path) || !path.is_file() {
        return Err(format!("Not an exported file: {}", path.display()));
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(format: &str) -> PandocJob {
        PandocJob {
            pandoc: String::new(),
            markdown: "# Hi".into(),
            format: format.into(),
            output: PathBuf::from("out").join("My Book.epub"),
            resource_dir: Some(PathBuf::from("docs")),
        }
    }

    #[test]
    fn builds_arguments() {
        let args = pandoc_args(&job("docx")).unwrap();
        assert!(args.contains(&"--to=docx".to_string()));
        assert!(args.contains(&"--standalone".to_string()));
        assert!(args.iter().any(|a| a.starts_with("--resource-path=")));
        assert!(!args.iter().any(|a| a.starts_with("--metadata")));
        let epub = pandoc_args(&job("epub")).unwrap();
        assert!(epub.contains(&"--metadata=title:My Book".to_string()));
    }

    #[test]
    fn rejects_unknown_formats() {
        assert!(pandoc_args(&job("exe")).is_err());
        assert!(pandoc_args(&job("--lua-filter=x")).is_err());
    }

    #[test]
    fn missing_program_is_reported() {
        let mut missing = job("docx");
        missing.pandoc = "mt-no-such-pandoc-program".into();
        assert_eq!(run_pandoc(&missing), Err(PANDOC_NOT_FOUND.to_string()));
        assert_eq!(version("mt-no-such-pandoc-program"), None);
    }

    #[test]
    fn opens_only_exported_files() {
        assert!(is_export_file(Path::new("a/b.HTML")));
        assert!(is_export_file(Path::new("b.docx")));
        assert!(!is_export_file(Path::new("b.exe")));
        assert!(!is_export_file(Path::new("noext")));
    }
}
