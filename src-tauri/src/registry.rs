// On-disk library registry. Mirrors the Electron `libraries.json` shape so a
// migrated install picks up its existing entries on first Tauri launch.

use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LibraryEntry {
    Local(LocalEntry),
    S3(S3Entry),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Entry {
    pub id: String,
    pub name: String,
    pub s3: S3Config,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    pub region: String,
    pub bucket: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub force_path_style: Option<bool>,
    pub credential_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrariesFile {
    pub version: u32,
    #[serde(default)]
    pub entries: Vec<LibraryEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_opened_id: Option<String>,
}

impl LibrariesFile {
    pub fn empty() -> Self {
        Self { version: 1, entries: Vec::new(), last_opened_id: None }
    }

    pub fn load(path: &Path) -> Self {
        let raw = match std::fs::read_to_string(path) {
            Ok(r) => r,
            Err(_) => return Self::empty(),
        };
        match serde_json::from_str::<Self>(&raw) {
            Ok(f) if f.version == 1 => f,
            _ => {
                let bak = path.with_extension(format!(
                    "json.corrupt-{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0),
                ));
                let _ = std::fs::rename(path, bak);
                Self::empty()
            }
        }
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).expect("serialize LibrariesFile");
        std::fs::write(path, json)
    }

    pub fn find(&self, id: &str) -> Option<&LibraryEntry> {
        self.entries.iter().find(|e| match e {
            LibraryEntry::Local(l) => l.id == id,
            LibraryEntry::S3(s) => s.id == id,
        })
    }

    pub fn find_idx(&self, id: &str) -> Option<usize> {
        self.entries.iter().position(|e| match e {
            LibraryEntry::Local(l) => l.id == id,
            LibraryEntry::S3(s) => s.id == id,
        })
    }

    pub fn new_id() -> String {
        Uuid::new_v4().to_string()
    }
}

pub fn entry_id(e: &LibraryEntry) -> &str {
    match e {
        LibraryEntry::Local(l) => &l.id,
        LibraryEntry::S3(s) => &s.id,
    }
}
