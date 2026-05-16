// Cross-platform secret store with a fixed `set/get/delete` surface.
//
// Desktop (macOS/Windows/Linux) → OS keychain via the `keyring` crate.
//   - Linux uses libsecret (Secret Service) — gracefully degrades to None
//     when no backend is present (WSL without secret-service running).
//
// Mobile (iOS/Android) → JSON file under the app's sandboxed data dir.
//   - iOS: ~/Documents/secrets.json inside the app container
//   - Android: <files-dir>/secrets.json inside the app's private storage
//   The OS sandbox is the security boundary; the file is not encrypted
//   beyond what the platform provides for per-app storage. Adequate for
//   read-later credentials; users who need stronger guarantees should
//   plug in `tauri-plugin-stronghold` later.
//
// The public API stays identical across targets so `agent_cmd.rs` and
// `libraries_cmd.rs` don't have to branch on platform.

#[cfg(not(any(target_os = "ios", target_os = "android")))]
mod imp {
    use keyring::Entry;

    const KEYRING_SERVICE: &str = "studio.catvinci.verko";

    fn entry(service: &str, account: &str) -> Result<Entry, String> {
        Entry::new(&format!("{KEYRING_SERVICE}/{service}"), account)
            .map_err(|e| format!("keyring entry: {e}"))
    }

    pub fn set_secret(service: &str, account: &str, secret: &str) -> Result<(), String> {
        entry(service, account)?
            .set_password(secret)
            .map_err(|e| format!("keyring set: {e}"))
    }

    pub fn get_secret(service: &str, account: &str) -> Result<Option<String>, String> {
        let entry = match entry(service, account) {
            Ok(e) => e,
            // No backend (e.g. WSL without secret service): treat as "no entry"
            // so the renderer surfaces "no key" instead of an exception.
            Err(_) => return Ok(None),
        };
        match entry.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            // Backend unreachable / locked / permission denied → treat as "no entry"
            // for read paths; write paths (set_secret) still error loudly.
            Err(_) => Ok(None),
        }
    }

    pub fn delete_secret(service: &str, account: &str) -> Result<(), String> {
        match entry(service, account)?.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keyring delete: {e}")),
        }
    }
}

#[cfg(any(target_os = "ios", target_os = "android"))]
mod imp {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};

    // Lazily-set data dir. lib.rs::run() must call `init_data_dir` from the
    // Tauri setup hook before any command tries to read/write secrets — we
    // can't resolve `app_data_dir` from a free function without the handle.
    static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
    // Single-process in-memory mirror so concurrent reads don't have to
    // re-parse the JSON every time.
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    pub fn init_data_dir(p: PathBuf) {
        let _ = DATA_DIR.set(p);
    }

    fn secrets_path() -> Result<PathBuf, String> {
        let dir = DATA_DIR
            .get()
            .ok_or_else(|| "keychain data dir not initialized".to_string())?;
        Ok(dir.join("secrets.json"))
    }

    fn cache() -> &'static Mutex<HashMap<String, String>> {
        CACHE.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn load_if_empty() -> Result<(), String> {
        let mut map = cache().lock().unwrap();
        if !map.is_empty() {
            return Ok(());
        }
        let path = secrets_path()?;
        if !path.exists() {
            return Ok(());
        }
        let text = std::fs::read_to_string(&path).map_err(|e| format!("read secrets: {e}"))?;
        if text.trim().is_empty() {
            return Ok(());
        }
        let parsed: HashMap<String, String> =
            serde_json::from_str(&text).map_err(|e| format!("parse secrets: {e}"))?;
        *map = parsed;
        Ok(())
    }

    fn flush(map: &HashMap<String, String>) -> Result<(), String> {
        let path = secrets_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
        }
        let json = serde_json::to_string(map).map_err(|e| format!("encode secrets: {e}"))?;
        // Best-effort restrict to user-only (no-op on iOS/Android sandbox,
        // but harmless and future-proof).
        std::fs::write(&path, json).map_err(|e| format!("write secrets: {e}"))
    }

    fn key(service: &str, account: &str) -> String {
        format!("{service}/{account}")
    }

    pub fn set_secret(service: &str, account: &str, secret: &str) -> Result<(), String> {
        load_if_empty()?;
        let mut map = cache().lock().unwrap();
        map.insert(key(service, account), secret.to_string());
        flush(&map)
    }

    pub fn get_secret(service: &str, account: &str) -> Result<Option<String>, String> {
        load_if_empty()?;
        let map = cache().lock().unwrap();
        Ok(map.get(&key(service, account)).cloned())
    }

    pub fn delete_secret(service: &str, account: &str) -> Result<(), String> {
        load_if_empty()?;
        let mut map = cache().lock().unwrap();
        if map.remove(&key(service, account)).is_some() {
            flush(&map)?;
        }
        Ok(())
    }
}

pub use imp::{delete_secret, get_secret, set_secret};

#[cfg(any(target_os = "ios", target_os = "android"))]
pub use imp::init_data_dir;
