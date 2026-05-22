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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn roots_with(label: &str, dir: &Path) -> Roots {
        let mut r = HashMap::new();
        r.insert(label.into(), dir.to_path_buf());
        r
    }

    #[test]
    fn rejects_unknown_root_id() {
        let roots = HashMap::new();
        let err = resolve_scoped(&roots, "missing", "foo.txt").unwrap_err();
        assert!(err.contains("Root not allowed"), "got: {err}");
    }

    #[test]
    fn rejects_absolute_paths() {
        let dir = tempfile::tempdir().unwrap();
        let roots = roots_with("test", dir.path());
        let err = resolve_scoped(&roots, "test", "/etc/passwd").unwrap_err();
        assert!(err.contains("Absolute path not allowed"), "got: {err}");
    }

    #[test]
    fn rejects_parent_dir_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let roots = roots_with("test", dir.path());
        let err = resolve_scoped(&roots, "test", "../outside.txt").unwrap_err();
        assert!(err.contains("Path escapes root"), "got: {err}");
    }

    #[test]
    fn rejects_nested_parent_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let roots = roots_with("test", dir.path());
        // Even when ../ is mid-path, ParentDir component is rejected outright.
        let err = resolve_scoped(&roots, "test", "papers/../../escape.txt").unwrap_err();
        assert!(err.contains("Path escapes root"), "got: {err}");
    }

    #[test]
    fn allows_simple_relative_paths() {
        let dir = tempfile::tempdir().unwrap();
        let roots = roots_with("test", dir.path());
        let p = resolve_scoped(&roots, "test", "papers/2024-foo.md").unwrap();
        assert!(p.starts_with(dir.path()));
        assert!(p.ends_with("papers/2024-foo.md"));
    }

    #[test]
    fn collapses_curdir_components() {
        let dir = tempfile::tempdir().unwrap();
        let roots = roots_with("test", dir.path());
        let p = resolve_scoped(&roots, "test", "./papers/./x.md").unwrap();
        assert!(p.ends_with("papers/x.md"));
    }

    #[test]
    fn allows_writing_to_nonexistent_file() {
        // canonicalize() returns NotFound for paths that don't exist yet.
        // This is the normal case for `fs_write` of a fresh paper.
        let dir = tempfile::tempdir().unwrap();
        let roots = roots_with("test", dir.path());
        let p = resolve_scoped(&roots, "test", "papers/new.md").unwrap();
        assert!(!p.exists());
        assert!(p.starts_with(dir.path()));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let outside_file = outside.path().join("secret.txt");
        fs::write(&outside_file, "secret").unwrap();

        // Plant a symlink inside the root that points outside.
        symlink(&outside_file, dir.path().join("escape.txt")).unwrap();

        let roots = roots_with("test", dir.path());
        let err = resolve_scoped(&roots, "test", "escape.txt").unwrap_err();
        assert!(err.contains("Symlink escapes root"), "got: {err}");
    }

    #[cfg(unix)]
    #[test]
    fn allows_symlink_within_root() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let inside_file = dir.path().join("real.md");
        fs::write(&inside_file, "ok").unwrap();
        symlink(&inside_file, dir.path().join("alias.md")).unwrap();

        let roots = roots_with("test", dir.path());
        let p = resolve_scoped(&roots, "test", "alias.md").unwrap();
        assert!(p.starts_with(dir.path()));
    }
}
