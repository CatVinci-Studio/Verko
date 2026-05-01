// libraries:* IPC. Manages the on-disk registry, scope registration, and
// S3 credential storage. Mirrors src/electron/{ipc/libraries.ts, paperdb/libraryManager.ts}.
//
// Network-bound calls (`probeS3`) live in the renderer alongside the S3 SDK —
// no AWS crate in Rust.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::keychain;
use crate::registry::{entry_id, LibrariesFile, LibraryEntry, LocalEntry, S3Config, S3Entry};
use crate::state::AppState;
use crate::zip_cmd;

const SVC_S3_CREDS: &str = "s3-creds";

// ── Serialization shapes that match shared/types.ts ─────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum LibraryInfo {
    Local {
        id: String,
        name: String,
        active: bool,
        #[serde(rename = "paperCount")]
        paper_count: u32,
        #[serde(rename = "lastOpenedAt", skip_serializing_if = "Option::is_none")]
        last_opened_at: Option<u64>,
        path: String,
    },
    S3 {
        id: String,
        name: String,
        active: bool,
        #[serde(rename = "paperCount")]
        paper_count: u32,
        #[serde(rename = "lastOpenedAt", skip_serializing_if = "Option::is_none")]
        last_opened_at: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        endpoint: Option<String>,
        region: String,
        bucket: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        prefix: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum NewLibraryInput {
    Local {
        name: String,
        path: String,
        #[serde(default)]
        initialize: bool,
    },
    S3 {
        name: String,
        endpoint: Option<String>,
        region: String,
        bucket: String,
        prefix: Option<String>,
        #[serde(rename = "forcePathStyle", default)]
        force_path_style: Option<bool>,
        #[serde(rename = "accessKeyId")]
        access_key_id: String,
        #[serde(rename = "secretAccessKey")]
        secret_access_key: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum ProbeResult {
    Ready,
    Uninitialized,
    Error { message: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct S3CredsOut {
    #[serde(rename = "accessKeyId")]
    pub access_key_id: String,
    #[serde(rename = "secretAccessKey")]
    pub secret_access_key: String,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn to_info(e: &LibraryEntry, active_id: Option<&str>) -> LibraryInfo {
    let id = entry_id(e);
    let active = active_id == Some(id);
    match e {
        LibraryEntry::Local(l) => LibraryInfo::Local {
            id: l.id.clone(),
            name: l.name.clone(),
            active,
            paper_count: 0,
            last_opened_at: l.last_opened_at,
            path: l.path.clone(),
        },
        LibraryEntry::S3(s) => LibraryInfo::S3 {
            id: s.id.clone(),
            name: s.name.clone(),
            active,
            paper_count: 0,
            last_opened_at: s.last_opened_at,
            endpoint: s.s3.endpoint.clone(),
            region: s.s3.region.clone(),
            bucket: s.s3.bucket.clone(),
            prefix: s.s3.prefix.clone(),
        },
    }
}

fn save_registry(state: &AppState) -> Result<(), String> {
    let reg = state.registry.lock().unwrap();
    reg.save(&state.libraries_json_path())
        .map_err(|e| format!("save libraries.json: {e}"))
}

fn mark_opened(state: &AppState, id: &str) -> Result<(), String> {
    {
        let mut reg = state.registry.lock().unwrap();
        if let Some(idx) = reg.find_idx(id) {
            match &mut reg.entries[idx] {
                LibraryEntry::Local(l) => l.last_opened_at = Some(now_ms()),
                LibraryEntry::S3(s) => s.last_opened_at = Some(now_ms()),
            }
            reg.last_opened_id = Some(id.to_string());
        }
    }
    save_registry(state)
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn libraries_list(state: State<'_, AppState>) -> Result<Vec<LibraryInfo>, String> {
    let active = state.active_id.lock().unwrap().clone();
    let reg = state.registry.lock().unwrap();
    Ok(reg.entries.iter().map(|e| to_info(e, active.as_deref())).collect())
}

#[tauri::command]
pub async fn libraries_has_none(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.active_id.lock().unwrap().is_none())
}

#[tauri::command]
pub async fn libraries_open(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryInfo, String> {
    let info = {
        let reg = state.registry.lock().unwrap();
        let entry = reg
            .find(&id)
            .ok_or_else(|| format!("Library \"{id}\" not in registry"))?;
        to_info(entry, Some(&id))
    };
    *state.active_id.lock().unwrap() = Some(id.clone());
    mark_opened(&state, &id)?;
    let _ = app.emit("library:switched", &info);
    Ok(info)
}

#[tauri::command]
pub async fn libraries_add(
    app: AppHandle,
    state: State<'_, AppState>,
    input: NewLibraryInput,
) -> Result<LibraryInfo, String> {
    let entry: LibraryEntry = match input {
        NewLibraryInput::Local { name, path, initialize } => {
            if initialize {
                std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            }
            let id = LibrariesFile::new_id();
            state
                .roots
                .lock()
                .unwrap()
                .insert(id.clone(), PathBuf::from(&path));
            LibraryEntry::Local(LocalEntry { id, name, path, last_opened_at: None })
        }
        NewLibraryInput::S3 {
            name,
            endpoint,
            region,
            bucket,
            prefix,
            force_path_style,
            access_key_id,
            secret_access_key,
        } => {
            let credential_ref = uuid::Uuid::new_v4().to_string();
            let creds_json = serde_json::to_string(&S3CredsOut {
                access_key_id,
                secret_access_key,
            })
            .map_err(|e| e.to_string())?;
            keychain::set_secret(SVC_S3_CREDS, &credential_ref, &creds_json)?;
            let id = LibrariesFile::new_id();
            LibraryEntry::S3(S3Entry {
                id,
                name,
                s3: S3Config {
                    endpoint,
                    region,
                    bucket,
                    prefix,
                    force_path_style,
                    credential_ref,
                },
                last_opened_at: None,
            })
        }
    };
    let info = {
        let mut reg = state.registry.lock().unwrap();
        reg.entries.push(entry.clone());
        to_info(&entry, Some(entry_id(&entry)))
    };
    save_registry(&state)?;
    let id = entry_id(&entry).to_string();
    *state.active_id.lock().unwrap() = Some(id.clone());
    mark_opened(&state, &id)?;
    let _ = app.emit("library:switched", &info);
    Ok(info)
}

#[tauri::command]
pub async fn libraries_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let removed = {
        let mut reg = state.registry.lock().unwrap();
        let Some(idx) = reg.find_idx(&id) else { return Ok(()) };
        reg.entries.remove(idx)
    };
    {
        let mut active = state.active_id.lock().unwrap();
        if active.as_deref() == Some(id.as_str()) {
            *active = None;
        }
    }
    match &removed {
        LibraryEntry::Local(_) => {
            state.roots.lock().unwrap().remove(&id);
        }
        LibraryEntry::S3(s) => {
            keychain::delete_secret(SVC_S3_CREDS, &s.s3.credential_ref)?;
        }
    }
    save_registry(&state)?;
    if state.active_id.lock().unwrap().is_none() {
        let _ = app.emit("library:none", serde_json::json!({ "reason": "empty" }));
    }
    Ok(())
}

#[tauri::command]
pub async fn libraries_rename(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    {
        let mut reg = state.registry.lock().unwrap();
        let Some(idx) = reg.find_idx(&id) else { return Ok(()) };
        match &mut reg.entries[idx] {
            LibraryEntry::Local(l) => l.name = new_name,
            LibraryEntry::S3(s) => s.name = new_name,
        }
    }
    save_registry(&state)
}

#[tauri::command]
pub async fn libraries_pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked.and_then(|p| p.as_path().map(|p| p.to_string_lossy().into_owned())))
}

#[tauri::command]
pub async fn libraries_probe_local(path: String) -> Result<ProbeResult, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Ok(ProbeResult::Error { message: "Folder does not exist".into() });
    }
    if p.join("schema.md").exists() {
        Ok(ProbeResult::Ready)
    } else {
        Ok(ProbeResult::Uninitialized)
    }
}

#[tauri::command]
pub async fn libraries_export_zip(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, String> {
    let (default_name, root_path) = {
        let reg = state.registry.lock().unwrap();
        let entry = reg
            .find(&id)
            .ok_or_else(|| format!("Library \"{id}\" not found"))?;
        match entry {
            LibraryEntry::Local(l) => {
                let safe = l
                    .name
                    .chars()
                    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                    .collect::<String>();
                (format!("{safe}.zip"), Some(l.path.clone()))
            }
            // S3 export is not supported in stage 2; the renderer can do it
            // through its S3 backend if needed.
            LibraryEntry::S3(s) => (format!("{}.zip", s.name), None),
        }
    };

    let Some(root) = root_path else {
        return Err("S3 library export must run from the renderer".into());
    };

    let out = app
        .dialog()
        .file()
        .set_title("Export library")
        .set_file_name(&default_name)
        .add_filter("Zip archive", &["zip"])
        .blocking_save_file();
    let Some(out) = out else { return Ok(None) };
    let out_path = out
        .as_path()
        .ok_or_else(|| "Save dialog returned non-filesystem path".to_string())?
        .to_path_buf();

    zip_cmd::export_local_zip(Path::new(&root), &out_path)?;
    Ok(Some(out_path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn libraries_import_zip(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<LibraryInfo>, String> {
    let zip_picked = app
        .dialog()
        .file()
        .set_title("Import library archive")
        .add_filter("Zip archive", &["zip"])
        .blocking_pick_file();
    let Some(zip_picked) = zip_picked else { return Ok(None) };
    let zip_path = zip_picked
        .as_path()
        .ok_or_else(|| "Pick dialog returned non-filesystem path".to_string())?
        .to_path_buf();

    let dest_picked = app
        .dialog()
        .file()
        .set_title("Choose destination folder (must be empty)")
        .blocking_pick_folder();
    let Some(dest_picked) = dest_picked else { return Ok(None) };
    let target_dir = dest_picked
        .as_path()
        .ok_or_else(|| "Folder dialog returned non-filesystem path".to_string())?
        .to_path_buf();

    zip_cmd::import_zip(&zip_path, &target_dir)?;

    let name = target_dir
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Imported".to_string());
    let path = target_dir.to_string_lossy().into_owned();
    libraries_add(
        app,
        state,
        NewLibraryInput::Local { name, path, initialize: false },
    )
    .await
    .map(Some)
}

#[tauri::command]
pub async fn libraries_s3_creds(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<S3CredsOut>, String> {
    let cred_ref = {
        let reg = state.registry.lock().unwrap();
        match reg.find(&id) {
            Some(LibraryEntry::S3(s)) => s.s3.credential_ref.clone(),
            _ => return Ok(None),
        }
    };
    let Some(json) = keychain::get_secret(SVC_S3_CREDS, &cred_ref)? else {
        return Ok(None);
    };
    let creds: S3CredsOut = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(creds))
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

/// Register every local library as a `fs:*` scope. Called once at app start
/// after the registry is loaded.
pub fn register_local_roots(app: &AppHandle) {
    let state = app.state::<AppState>();
    let entries = state.registry.lock().unwrap().entries.clone();
    let last = state.registry.lock().unwrap().last_opened_id.clone();
    let mut roots = state.roots.lock().unwrap();
    for e in &entries {
        if let LibraryEntry::Local(l) = e {
            roots.insert(l.id.clone(), PathBuf::from(&l.path));
        }
    }
    drop(roots);

    // Preserve last-opened: if the entry exists, mark it active so the
    // renderer's hasNone check matches Electron behavior.
    if let Some(id) = last {
        let exists = state.registry.lock().unwrap().find(&id).is_some();
        if exists {
            *state.active_id.lock().unwrap() = Some(id);
        }
    }
}
