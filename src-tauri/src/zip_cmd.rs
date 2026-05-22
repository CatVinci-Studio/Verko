// Zip export / import for local libraries. S3 libraries fall through to the
// renderer-side webApi machinery (their export was never wired in Electron
// either — the export entry only handles whatever buildBackend gave back).

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;

pub fn export_local_zip(library_root: &Path, out_path: &Path) -> Result<(), String> {
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = fs::File::create(out_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut files = Vec::new();
    walk(library_root, &mut files).map_err(|e| e.to_string())?;
    for abs in files {
        let rel = abs
            .strip_prefix(library_root)
            .map_err(|e| e.to_string())?
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        zip.start_file(&rel, opts).map_err(|e| e.to_string())?;
        let mut f = fs::File::open(&abs).map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        zip.write_all(&buf).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_zip(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
    // Refuse to overlay onto a populated folder — silently merging libraries
    // is a footgun.
    if let Ok(entries) = fs::read_dir(target_dir) {
        if entries.count() > 0 {
            return Err(format!(
                "Target directory is not empty: {}",
                target_dir.display()
            ));
        }
    }
    fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;

    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    if archive.by_name("schema.md").is_err() {
        return Err("Not a valid library archive (schema.md missing).".to_string());
    }

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(rel) = entry.enclosed_name() else { continue };
        let dest = target_dir.join(rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn walk(dir: &Path, acc: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let p = entry.path();
        let ft = entry.file_type()?;
        if ft.is_dir() {
            walk(&p, acc)?;
        } else if ft.is_file() {
            acc.push(p);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, rel: &str, body: &str) {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(p, body).unwrap();
    }

    #[test]
    fn export_then_import_roundtrip() {
        let src = tempfile::tempdir().unwrap();
        write(src.path(), "schema.md", "# schema\n");
        write(src.path(), "papers.csv", "id,title\n2024-foo,Foo\n");
        write(src.path(), "papers/2024-foo.md", "Notes for foo");

        let zip_dir = tempfile::tempdir().unwrap();
        let zip_path = zip_dir.path().join("lib.zip");
        export_local_zip(src.path(), &zip_path).unwrap();
        assert!(zip_path.exists());

        let dst = tempfile::tempdir().unwrap();
        let target = dst.path().join("restored");
        import_zip(&zip_path, &target).unwrap();

        assert_eq!(
            fs::read_to_string(target.join("schema.md")).unwrap(),
            "# schema\n",
        );
        assert_eq!(
            fs::read_to_string(target.join("papers/2024-foo.md")).unwrap(),
            "Notes for foo",
        );
    }

    #[test]
    fn import_refuses_non_empty_target() {
        let src = tempfile::tempdir().unwrap();
        write(src.path(), "schema.md", "# schema\n");
        let zip_path = src.path().join("lib.zip");
        export_local_zip(src.path(), &zip_path).unwrap();

        let dst = tempfile::tempdir().unwrap();
        write(dst.path(), "stranger.txt", "i was here first");

        let err = import_zip(&zip_path, dst.path()).unwrap_err();
        assert!(err.contains("not empty"), "got: {err}");
    }

    #[test]
    fn import_rejects_archive_without_schema() {
        let src = tempfile::tempdir().unwrap();
        // No schema.md — only a stray file.
        write(src.path(), "papers.csv", "id\n");
        let zip_path = src.path().join("lib.zip");
        export_local_zip(src.path(), &zip_path).unwrap();

        let dst = tempfile::tempdir().unwrap();
        let target = dst.path().join("restored");
        let err = import_zip(&zip_path, &target).unwrap_err();
        assert!(err.contains("schema.md missing"), "got: {err}");
    }

    #[test]
    fn export_creates_parent_dirs() {
        let src = tempfile::tempdir().unwrap();
        write(src.path(), "schema.md", "x");
        let dst = tempfile::tempdir().unwrap();
        let nested = dst.path().join("a/b/c/lib.zip");

        export_local_zip(src.path(), &nested).unwrap();
        assert!(nested.exists());
    }
}
