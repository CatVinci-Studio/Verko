// paths:* IPC. Mirrors src/electron/ipc/paths.ts.

use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn paths_library_root(
    state: State<'_, AppState>,
    root_id: String,
) -> Result<Option<String>, String> {
    let roots = state.roots.lock().unwrap();
    Ok(roots.get(&root_id).map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn paths_user_data(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.data_dir.to_string_lossy().into_owned())
}
