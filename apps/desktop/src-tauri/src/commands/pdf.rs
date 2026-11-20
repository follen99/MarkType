//! PDF export without the print dialog (Windows): the exported page is loaded in a hidden window and
//! WebView2 `PrintToPdf` writes the file. Other systems keep the print dialog ("Save as PDF").

use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
// Only Windows reads the fields; elsewhere the command reports that it is unavailable.
#[cfg_attr(not(windows), allow(dead_code))]
pub struct PdfJob {
    /// The standalone HTML page (images and theme assets embedded).
    pub html: String,
    pub output: PathBuf,
    /// Title, date and page numbers at the top and bottom of each page.
    pub header_footer: bool,
    pub title: String,
}

#[cfg(windows)]
#[tauri::command]
pub async fn print_pdf(app: tauri::AppHandle, job: PdfJob) -> Result<(), String> {
    windows_pdf::print(app, job).await
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn print_pdf(_job: PdfJob) -> Result<(), String> {
    Err("Direct PDF export is only available on Windows".into())
}

#[cfg(windows)]
mod windows_pdf {
    use super::PdfJob;
    use crate::commands::settings;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::{Arc, mpsc};
    use std::time::Duration;
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, webview::PageLoadEvent};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_7, ICoreWebView2Environment6,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{HSTRING, Interface};

    static NEXT: AtomicU32 = AtomicU32::new(1);
    /// Time for web fonts (KaTeX) and images to settle after the page load event.
    const SETTLE: Duration = Duration::from_millis(600);
    const TIMEOUT: Duration = Duration::from_secs(120);

    type Done = mpsc::Sender<Result<(), String>>;

    /// Runs `PrintToPdf` on the hidden window's WebView2 (called on the main thread).
    fn print_webview(webview: tauri::webview::PlatformWebview, job: &PdfJob, done: Done) {
        let start = || -> windows::core::Result<()> {
            unsafe {
                let core = webview
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_7>()?;
                let settings = webview
                    .environment()
                    .cast::<ICoreWebView2Environment6>()?
                    .CreatePrintSettings()?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(job.header_footer)?;
                if job.header_footer {
                    // Empty: the page's <title>.
                    if !job.title.is_empty() {
                        settings.SetHeaderTitle(&HSTRING::from(job.title.as_str()))?;
                    }
                    // An empty footer URI leaves only the page numbers.
                    settings.SetFooterUri(&HSTRING::new())?;
                }
                let sender = done.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                    let outcome = match result {
                        Err(e) => Err(format!("PDF export failed: {e}")),
                        Ok(()) if !ok => Err("PDF export failed".into()),
                        Ok(()) => Ok(()),
                    };
                    let _ = sender.send(outcome);
                    Ok(())
                }));
                core.PrintToPdf(&HSTRING::from(job.output.as_os_str()), &settings, &handler)
            }
        };
        if let Err(e) = start() {
            let _ = done.send(Err(format!("PDF export failed: {e}")));
        }
    }

    pub async fn print(app: tauri::AppHandle, job: PdfJob) -> Result<(), String> {
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let page =
            std::env::temp_dir().join(format!("marktype-pdf-{}-{n}.html", std::process::id()));
        std::fs::write(&page, &job.html)
            .map_err(|e| format!("Cannot write {}: {e}", page.display()))?;
        let url =
            tauri::Url::from_file_path(&page).map_err(|_| "Invalid temporary path".to_string())?;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let job = Arc::new(job);
        let started = Arc::new(AtomicBool::new(false));
        let label = format!("pdf-{n}");
        let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
            .visible(false)
            .skip_taskbar(true)
            .focused(false)
            // Every window must use the WebView2 flags of the first one (same environment).
            .additional_browser_args(settings::startup_webview_args(&app))
            .on_page_load({
                let tx = tx.clone();
                move |webview, payload| {
                    if payload.event() != PageLoadEvent::Finished
                        || started.swap(true, Ordering::SeqCst)
                    {
                        return;
                    }
                    let (webview, job, tx) = (webview.clone(), job.clone(), tx.clone());
                    std::thread::spawn(move || {
                        std::thread::sleep(SETTLE);
                        let done = tx.clone();
                        if let Err(e) = webview
                            .with_webview(move |platform| print_webview(platform, &job, done))
                        {
                            let _ = tx.send(Err(e.to_string()));
                        }
                    });
                }
            });
        let result = match builder.build() {
            Err(e) => Err(format!("Cannot open the PDF window: {e}")),
            Ok(_) => tauri::async_runtime::spawn_blocking(move || {
                rx.recv_timeout(TIMEOUT)
                    .unwrap_or_else(|_| Err("PDF export timed out".into()))
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string())),
        };
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.destroy();
        }
        let _ = std::fs::remove_file(&page);
        drop(tx);
        result
    }
}
