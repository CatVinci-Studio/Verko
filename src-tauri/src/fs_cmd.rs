// fs:* IPC. Mirrors src/electron/ipc/fs.ts. All paths flow through `resolve_scoped`.

use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::{ipc::Response, State};

use crate::scope::resolve_scoped;
use crate::state::AppState;

#[tauri::command]
pub async fn fs_read(
    state: State<'_, AppState>,
    root_id: String,
    rel: String,
) -> Result<Response, String> {
    let abs = {
        let roots = state.roots.lock().unwrap();
        resolve_scoped(&roots, &root_id, &rel)?
    };
    let bytes = fs::read(&abs).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn fs_write(
    state: State<'_, AppState>,
    root_id: String,
    rel: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let abs = {
        let roots = state.roots.lock().unwrap();
        resolve_scoped(&roots, &root_id, &rel)?
    };
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write(&abs, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_delete(
    state: State<'_, AppState>,
    root_id: String,
    rel: String,
) -> Result<(), String> {
    let abs = {
        let roots = state.roots.lock().unwrap();
        resolve_scoped(&roots, &root_id, &rel)?
    };
    match fs::remove_file(&abs) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn fs_list(
    state: State<'_, AppState>,
    root_id: String,
    prefix: String,
) -> Result<Vec<String>, String> {
    let (root, base) = {
        let roots = state.roots.lock().unwrap();
        let root = roots
            .get(&root_id)
            .ok_or_else(|| format!("Root not allowed: {root_id}"))?
            .clone();
        let base = resolve_scoped(&roots, &root_id, if prefix.is_empty() { "." } else { &prefix })?;
        (root, base)
    };
    let mut out = Vec::new();
    if let Err(e) = walk(&base, &mut out) {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(e.to_string());
        }
        return Ok(Vec::new());
    }
    let mut rels: Vec<String> = out
        .into_iter()
        .filter_map(|abs| abs.strip_prefix(&root).ok().map(|p| {
            p.components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        }))
        .collect();
    rels.sort();
    Ok(rels)
}

#[tauri::command]
pub async fn fs_exists(
    state: State<'_, AppState>,
    root_id: String,
    rel: String,
) -> Result<bool, String> {
    let abs = {
        let roots = state.roots.lock().unwrap();
        match resolve_scoped(&roots, &root_id, &rel) {
            Ok(p) => p,
            Err(_) => return Ok(false),
        }
    };
    Ok(abs.exists())
}

fn walk(dir: &Path, acc: &mut Vec<std::path::PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let p = entry.path();
        let ft = entry.file_type()?;
        if ft.is_dir() {
            walk(&p, acc)?;
        } else if ft.is_file() {
            acc.push(p);
        }
    }
    Ok(())
}

fn atomic_write(abs: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = abs.with_extension(format!(
        "{}.{}.tmp",
        abs.extension().and_then(|s| s.to_str()).unwrap_or(""),
        uuid::Uuid::new_v4().simple(),
    ));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
    }
    if let Err(e) = fs::rename(&tmp, abs) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}
