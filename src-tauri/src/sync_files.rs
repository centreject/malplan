//! Thin file access for the sync folder (local disk, NAS share, or a cloud-synced folder).
//! All merge logic lives in TypeScript; these commands only list, read and write files.

use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Only plain file names inside the chosen folder: no separators, no "..".
fn file_path(dir: &str, name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty()
        && name != "."
        && name != ".."
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));

    if !valid {
        return Err(format!("invalid sync file name: {name}"));
    }

    Ok(Path::new(dir).join(name))
}

fn text_error(error: std::io::Error) -> String {
    error.to_string()
}

#[tauri::command]
pub fn sync_default_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("sync");

    fs::create_dir_all(&dir).map_err(text_error)?;

    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn sync_list(dir: String) -> Result<Vec<String>, String> {
    fs::create_dir_all(&dir).map_err(text_error)?;

    let mut names = Vec::new();

    for entry in fs::read_dir(&dir).map_err(text_error)? {
        let entry = entry.map_err(text_error)?;

        if entry.file_type().map_err(text_error)?.is_file() {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }

    Ok(names)
}

#[tauri::command]
pub fn sync_read(dir: String, name: String) -> Result<Option<String>, String> {
    match fs::read_to_string(file_path(&dir, &name)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Write via a temp file and rename, so readers never see a half-written file.
#[tauri::command]
pub fn sync_write(dir: String, name: String, content: String) -> Result<(), String> {
    let target = file_path(&dir, &name)?;
    let temp = file_path(&dir, &format!("{name}.tmp"))?;

    fs::write(&temp, content).map_err(text_error)?;
    fs::rename(&temp, &target).map_err(text_error)
}

/// Append one line. If an earlier append was cut short (no trailing newline), start on a fresh
/// line so only the broken line is lost, not the new one.
#[tauri::command]
pub fn sync_append(dir: String, name: String, line: String) -> Result<(), String> {
    let path = file_path(&dir, &name)?;
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(&path)
        .map_err(text_error)?;
    let length = file.metadata().map_err(text_error)?.len();
    let mut prefix = "";

    if length > 0 {
        let mut last = [0u8; 1];

        file.seek(SeekFrom::Start(length - 1)).map_err(text_error)?;
        file.read_exact(&mut last).map_err(text_error)?;

        if last[0] != b'\n' {
            prefix = "\n";
        }
    }

    file.write_all(format!("{prefix}{line}").as_bytes()).map_err(text_error)?;
    file.sync_data().map_err(text_error)
}
