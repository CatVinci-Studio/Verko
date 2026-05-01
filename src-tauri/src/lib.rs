// Verko Tauri shim. Exposes a narrow IO surface (fs / dialog / paths /
// libraries / agent-keychain) over `#[tauri::command]` so the renderer's
// `IPreloadApi` adapter (`tauri/tauriPreload.ts`) can drop in over the
// existing `makeDesktopApi` pipeline. All business logic stays in the
// renderer; this file is the only platform-specific layer.

mod agent_cmd;
mod dialog_cmd;
mod fs_cmd;
mod keychain;
mod libraries_cmd;
mod menu;
mod paths_cmd;
mod registry;
mod scope;
mod state;
mod zip_cmd;

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::Manager;

use crate::agent_cmd::SessionKeys;
use crate::registry::LibrariesFile;
use crate::state::AppState;

const CONVERSATIONS_ROOT: &str = "conversations";
const TRANSCRIPTS_ROOT: &str = "transcripts";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_config_dir()
                .expect("resolve app_config_dir");
            std::fs::create_dir_all(&data_dir)?;

            // Reserved scopes: conversations + pre-compaction transcripts.
            let conv_dir = data_dir.join("conversations");
            std::fs::create_dir_all(&conv_dir)?;
            let transcripts_dir = data_dir.join("transcripts");
            std::fs::create_dir_all(&transcripts_dir)?;

            let registry = LibrariesFile::load(&data_dir.join("libraries.json"));
            let app_state = AppState::new(data_dir, registry);
            app_state
                .roots
                .lock()
                .unwrap()
                .insert(CONVERSATIONS_ROOT.into(), conv_dir);
            app_state
                .roots
                .lock()
                .unwrap()
                .insert(TRANSCRIPTS_ROOT.into(), transcripts_dir);

            app.manage(app_state);
            app.manage(SessionKeys(Mutex::new(HashMap::new())));

            libraries_cmd::register_local_roots(app.handle());
            menu::install(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // fs
            fs_cmd::fs_read,
            fs_cmd::fs_write,
            fs_cmd::fs_delete,
            fs_cmd::fs_list,
            fs_cmd::fs_exists,
            // paths
            paths_cmd::paths_library_root,
            paths_cmd::paths_user_data,
            // dialog
            dialog_cmd::dialog_open_pdf,
            // agent (keychain only)
            agent_cmd::agent_save_key,
            agent_cmd::agent_load_key,
            agent_cmd::agent_has_key,
            // libraries
            libraries_cmd::libraries_list,
            libraries_cmd::libraries_has_none,
            libraries_cmd::libraries_open,
            libraries_cmd::libraries_add,
            libraries_cmd::libraries_remove,
            libraries_cmd::libraries_rename,
            libraries_cmd::libraries_pick_folder,
            libraries_cmd::libraries_probe_local,
            libraries_cmd::libraries_export_zip,
            libraries_cmd::libraries_import_zip,
            libraries_cmd::libraries_s3_creds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
