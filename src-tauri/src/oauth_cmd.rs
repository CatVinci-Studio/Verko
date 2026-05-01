// One-shot loopback HTTP listener for OAuth callbacks. The renderer drives
// the rest of the flow (PKCE generation, opening the browser, token
// exchange, refresh) — see `src/shared/oauth/codex.ts`. This command
// exists solely because a webview can't bind a TCP socket; it parses the
// first GET request, captures the `code` + `state` query params, returns
// them, then closes the listener.
//
// Single bind per process: if a previous attempt didn't receive a
// callback the socket may still be in use, in which case re-running just
// fails with "Address already in use" — surface that to the user.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use serde::Serialize;

const SUCCESS_HTML: &str = r#"<!doctype html>
<html><head><title>Verko — Sign-in complete</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#f1ecec}.box{text-align:center;padding:2rem}h1{margin:0 0 .5rem 0}p{color:#b7b1b1;margin:0}</style>
</head><body><div class="box"><h1>Sign-in complete</h1><p>You can close this tab and return to Verko.</p></div>
<script>setTimeout(()=>window.close(),1500)</script></body></html>
"#;

const ERROR_HTML: &str = r#"<!doctype html>
<html><head><title>Verko — Sign-in failed</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fc533a}.box{text-align:center;padding:2rem}p{color:#b7b1b1}</style>
</head><body><div class="box"><h1>Sign-in failed</h1><p>You can close this tab and try again.</p></div></body></html>
"#;

#[derive(Serialize)]
pub struct OauthCallback {
    code: String,
    state: String,
}

#[tauri::command]
pub async fn oauth_loopback_wait(
    port: u16,
    path: String,
    timeout_secs: u64,
) -> Result<OauthCallback, String> {
    let timeout = Duration::from_secs(timeout_secs.clamp(10, 600));
    tokio::task::spawn_blocking(move || run_listener(port, &path, timeout))
        .await
        .map_err(|e| e.to_string())?
}

fn run_listener(port: u16, path: &str, timeout: Duration) -> Result<OauthCallback, String> {
    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).map_err(|e| format!("bind {addr}: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    // Poll instead of spawning a thread that blocks indefinitely on
    // `accept()` — the original spawn-and-recv_timeout shape leaked the
    // listener thread when the parent gave up.
    let deadline = Instant::now() + timeout;
    let stream = loop {
        match listener.accept() {
            Ok((stream, _)) => break stream,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("OAuth callback timed out".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("accept: {e}")),
        }
    };

    handle_request(stream, path)
}

fn handle_request(mut stream: std::net::TcpStream, expected_path: &str) -> Result<OauthCallback, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .ok();
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);

    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| format!("read: {e}"))?;

    // Drain headers — we don't need them but the kernel buffer wants emptying
    // before we write the response on some platforms.
    let mut header = String::new();
    while let Ok(n) = reader.read_line(&mut header) {
        if n == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        header.clear();
    }

    // GET /auth/callback?code=…&state=… HTTP/1.1
    let url_part = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "malformed request".to_string())?;

    let (path, query) = match url_part.split_once('?') {
        Some((p, q)) => (p, q),
        None => (url_part, ""),
    };

    let mut send = |status: &str, body: &str| -> Result<(), String> {
        let resp = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(resp.as_bytes()).map_err(|e| e.to_string())?;
        stream.flush().ok();
        Ok(())
    };

    if path != expected_path {
        send("404 Not Found", ERROR_HTML).ok();
        return Err(format!("unexpected callback path: {path}"));
    }

    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    let mut error: Option<String> = None;
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some(kv) => kv,
            None => continue,
        };
        let v = url_decode(v);
        match k {
            "code" => code = Some(v),
            "state" => state = Some(v),
            "error" => error = Some(v),
            _ => {}
        }
    }

    if let Some(err) = error {
        send("200 OK", ERROR_HTML).ok();
        return Err(format!("auth error: {err}"));
    }

    match (code, state) {
        (Some(code), Some(state)) => {
            send("200 OK", SUCCESS_HTML).ok();
            Ok(OauthCallback { code, state })
        }
        _ => {
            send("400 Bad Request", ERROR_HTML).ok();
            Err("missing code or state in callback".into())
        }
    }
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16).unwrap_or(0) as u8;
                let lo = (bytes[i + 2] as char).to_digit(16).unwrap_or(0) as u8;
                out.push((hi << 4) | lo);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
