// OS-keychain backed secret storage. Replaces Electron `safeStorage` for both
// agent API keys and S3 credentials. Each entry is a single key/value pair
// keyed by `(service, account)`.

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
    match entry(service, account)?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get: {e}")),
    }
}

pub fn delete_secret(service: &str, account: &str) -> Result<(), String> {
    match entry(service, account)?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete: {e}")),
    }
}
