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

#[cfg(test)]
mod tests {
    use super::*;

    fn local(id: &str, name: &str, path: &str) -> LibraryEntry {
        LibraryEntry::Local(LocalEntry {
            id: id.into(),
            name: name.into(),
            path: path.into(),
            last_opened_at: None,
        })
    }

    #[test]
    fn empty_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let f = LibrariesFile::load(&dir.path().join("absent.json"));
        assert_eq!(f.version, 1);
        assert!(f.entries.is_empty());
        assert!(f.last_opened_id.is_none());
    }

    #[test]
    fn save_and_reload_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("libs.json");
        let mut original = LibrariesFile::empty();
        original.entries.push(local("id-1", "Library A", "/tmp/a"));
        original.entries.push(local("id-2", "Library B", "/tmp/b"));
        original.last_opened_id = Some("id-2".into());
        original.save(&path).unwrap();

        let reloaded = LibrariesFile::load(&path);
        assert_eq!(reloaded.version, 1);
        assert_eq!(reloaded.entries.len(), 2);
        assert_eq!(entry_id(&reloaded.entries[0]), "id-1");
        assert_eq!(reloaded.last_opened_id.as_deref(), Some("id-2"));
    }

    #[test]
    fn corrupt_file_falls_back_to_empty_and_renames() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("libs.json");
        std::fs::write(&path, "{ this is not valid json").unwrap();

        let f = LibrariesFile::load(&path);
        assert!(f.entries.is_empty());
        // The corrupt file should have been moved aside, not deleted.
        let renamed: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| {
                let n = e.file_name();
                let s = n.to_string_lossy();
                s.starts_with("libs.json.corrupt-")
            })
            .collect();
        assert_eq!(renamed.len(), 1, "expected one corrupt-* sibling");
    }

    #[test]
    fn unknown_version_is_rejected_as_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("libs.json");
        std::fs::write(&path, r#"{"version": 99, "entries": []}"#).unwrap();

        let f = LibrariesFile::load(&path);
        assert!(f.entries.is_empty(), "v99 should not load as v1");
    }

    #[test]
    fn find_by_id_works_for_local_and_s3() {
        let mut f = LibrariesFile::empty();
        f.entries.push(local("local-1", "L", "/tmp"));
        f.entries.push(LibraryEntry::S3(S3Entry {
            id: "s3-1".into(),
            name: "S".into(),
            s3: S3Config {
                endpoint: None,
                region: "us-east-1".into(),
                bucket: "b".into(),
                prefix: None,
                force_path_style: None,
                credential_ref: "c".into(),
            },
            last_opened_at: None,
        }));

        assert!(f.find("local-1").is_some());
        assert!(f.find("s3-1").is_some());
        assert!(f.find("missing").is_none());
        assert_eq!(f.find_idx("s3-1"), Some(1));
    }

    #[test]
    fn new_id_returns_distinct_uuids() {
        let a = LibrariesFile::new_id();
        let b = LibrariesFile::new_id();
        assert_ne!(a, b);
        // basic uuid shape: 8-4-4-4-12
        assert_eq!(a.len(), 36);
    }
}
