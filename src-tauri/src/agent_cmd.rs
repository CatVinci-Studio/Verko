// agent:* IPC for keys + profile-key presence. Config / profile editing live
// in the renderer (localStorage, mirroring webApi) — Rust only owns the OS
// keychain so secrets stay encrypted at rest.
//
// Two-tier key storage matches Electron's keyStore.ts: persisted entries go
// to the keychain; "remember=false" entries live in a session map cleared on
// quit. `loadKey` checks session first.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

use crate::keychain;

const SVC_AGENT_KEYS: &str = "agent-keys";

pub struct SessionKeys(pub Mutex<HashMap<String, String>>);

#[tauri::command]
pub async fn agent_save_key(
    session: State<'_, SessionKeys>,
    profile: String,
    key: String,
    remember: bool,
) -> Result<(), String> {
    if remember {
        keychain::set_secret(SVC_AGENT_KEYS, &profile, &key)?;
        session.0.lock().unwrap().remove(&profile);
    } else {
        session.0.lock().unwrap().insert(profile.clone(), key);
        // "Forget" semantics: drop any persisted copy.
        keychain::delete_secret(SVC_AGENT_KEYS, &profile)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_load_key(
    session: State<'_, SessionKeys>,
    profile: String,
) -> Result<Option<String>, String> {
    if let Some(s) = session.0.lock().unwrap().get(&profile) {
        return Ok(Some(s.clone()));
    }
    keychain::get_secret(SVC_AGENT_KEYS, &profile)
}

#[tauri::command]
pub async fn agent_has_key(
    session: State<'_, SessionKeys>,
    profile: String,
) -> Result<bool, String> {
    if session.0.lock().unwrap().contains_key(&profile) {
        return Ok(true);
    }
    Ok(keychain::get_secret(SVC_AGENT_KEYS, &profile)?.is_some())
}
