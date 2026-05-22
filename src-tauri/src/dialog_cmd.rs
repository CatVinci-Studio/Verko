// dialog:* IPC. Replaces src/electron/ipc/dialog.ts. The renderer expects
// the file *bytes* back, not just a path — keeps the zero-trust scope intact.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
pub struct OpenedPdf {
    pub filename: String,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub async fn dialog_open_pdf(app: AppHandle) -> Result<Option<OpenedPdf>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file();

    let Some(file) = picked else { return Ok(None) };
    let path = file
        .as_path()
        .ok_or_else(|| "Dialog returned a non-filesystem path".to_string())?;
    let filename = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(Some(OpenedPdf { filename, bytes }))
}
