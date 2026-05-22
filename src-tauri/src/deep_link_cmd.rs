// Mobile deep-link handler. Receives `verko://ingest?url=…` URLs from the
// OS share sheet (iOS) / Send intent (Android) and re-emits them on the
// webview's event bus as `deeplink:ingest` so the renderer can drop the
// URL into the inbox via `Library.ingestUrl()`.
//
// Desktop builds do not include this module — see `lib.rs` where the
// plugin is `#[cfg]`'d in.

#![cfg(any(target_os = "ios", target_os = "android"))]

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

const SCHEME: &str = "verko";
const INGEST_HOST: &str = "ingest";

/// Wire up the deep-link listener. Call from the Tauri setup hook after
/// the plugin is registered.
pub fn install(app: &AppHandle) {
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            if url.scheme() != SCHEME {
                continue;
            }
            // Accept both verko://ingest?url=… and verko://ingest/<encoded>
            let host = url.host_str().unwrap_or("");
            if host != INGEST_HOST {
                continue;
            }
            let target = url
                .query_pairs()
                .find(|(k, _)| k == "url")
                .map(|(_, v)| v.into_owned())
                .or_else(|| {
                    // Fallback: take the trailing path segment.
                    url.path_segments()
                        .and_then(|mut s| s.next())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            if target.is_empty() {
                continue;
            }
            let _ = handle.emit("deeplink:ingest", target);
        }
    });
}
