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
