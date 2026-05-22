// Process-wide state owned by Tauri. All commands take `State<AppState>`.

use std::path::PathBuf;
use std::sync::Mutex;

use crate::registry::LibrariesFile;
use crate::scope::Roots;

pub struct AppState {
    pub data_dir: PathBuf,
    pub roots: Mutex<Roots>,
    pub registry: Mutex<LibrariesFile>,
    pub active_id: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, registry: LibrariesFile) -> Self {
        Self {
            data_dir,
            roots: Mutex::new(Roots::new()),
            registry: Mutex::new(registry),
            active_id: Mutex::new(None),
        }
    }

    pub fn libraries_json_path(&self) -> PathBuf {
        self.data_dir.join("libraries.json")
    }
}
