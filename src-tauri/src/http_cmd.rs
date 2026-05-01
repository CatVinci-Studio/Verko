// Outbound HTTP fetch routed through Rust to bypass webview CORS.
// The renderer's `fetch` is subject to the webview's CORS policy, so calls
// to sites that don't return permissive Access-Control-Allow-Origin (arxiv,
// most paper-host pages) fail before leaving the app. This command does
// the request from native code where CORS doesn't apply.
//
// Surface is intentionally narrow: GET / POST, http(s) only, body is
// returned as a string (truncated by the caller). No streaming, no cookies.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct FetchRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Serialize)]
pub struct FetchResponse {
    status: u16,
    ok: bool,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
pub async fn http_fetch(req: FetchRequest) -> Result<FetchResponse, String> {
    if !(req.url.starts_with("http://") || req.url.starts_with("https://")) {
        return Err("URL must start with http:// or https://".into());
    }

    let method = req.method.as_deref().unwrap_or("GET").to_uppercase();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Verko/0.5 (mailto:leonardoshen@icloud.com)")
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = match method.as_str() {
        "GET" => client.get(&req.url),
        "POST" => client.post(&req.url),
        "PUT" => client.put(&req.url),
        "DELETE" => client.delete(&req.url),
        "HEAD" => client.head(&req.url),
        m => return Err(format!("unsupported method: {m}")),
    };

    if let Some(headers) = req.headers {
        for (k, v) in headers {
            builder = builder.header(k, v);
        }
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let res = builder.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let ok = res.status().is_success();
    let headers = res
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
        .collect();
    let body = res.text().await.map_err(|e| e.to_string())?;

    Ok(FetchResponse { status, ok, headers, body })
}
