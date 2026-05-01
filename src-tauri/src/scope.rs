// Zero-trust scope enforcement, ported 1:1 from src/electron/scope.ts.
//
// The renderer never sends absolute paths — it sends `(root_id, rel)` and we
// verify every resolved path stays inside the registered root, post symlink
// resolution. Compromised renderer = blast radius bounded to registered roots.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

pub type Roots = HashMap<String, PathBuf>;

pub fn resolve_scoped(roots: &Roots, root_id: &str, rel: &str) -> Result<PathBuf, String> {
    let root = roots
        .get(root_id)
        .ok_or_else(|| format!("Root not allowed: {root_id}"))?;

    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("Absolute path not allowed: {rel}"));
    }

    let mut joined = root.clone();
    for c in rel_path.components() {
        match c {
            Component::Normal(seg) => joined.push(seg),
            Component::CurDir => {}
            // ParentDir / RootDir / Prefix all attempt to escape the scope.
            _ => return Err(format!("Path escapes root: {rel}")),
        }
    }

    // Pre-realpath: defensive normalize check.
    if joined != *root && !joined.starts_with(root) {
        return Err(format!("Path escapes root: {rel}"));
    }

    // Post-realpath: catch symlink escape if the target exists. ENOENT is fine
    // (write to a not-yet-existing file).
    match joined.canonicalize() {
        Ok(real) => {
            let canonical_root = root.canonicalize().unwrap_or_else(|_| root.clone());
            if real != canonical_root && !real.starts_with(&canonical_root) {
                return Err(format!("Symlink escapes root: {rel}"));
            }
            Ok(real)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(joined),
        Err(e) => Err(format!("canonicalize failed: {e}")),
    }
}
