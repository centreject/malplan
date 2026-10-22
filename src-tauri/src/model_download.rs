//! First-run model download. URL, size and hash are fixed here: the frontend can only say
//! "download" or "pause". Streams to a .part file, resumes with Range, and renames to the final
//! name only after the SHA256 matches.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_http::reqwest::{header::RANGE, Client, StatusCode};

use crate::llm_server::{models_dir, MODEL_FILE};

const MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf";
const MODEL_SIZE: u64 = 2_497_280_256;
const MODEL_SHA256: &str = "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5";

/// Automatic resumes after a dropped connection, 3s, 6s, … apart.
const RETRIES: u32 = 5;

/// Emit progress about every 4MB.
const PROGRESS_STEP: u64 = 4 << 20;

#[derive(Default)]
pub struct Download {
    active: AtomicBool,
    cancel: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    dir: String,
    /// Bytes of the verified model, if present.
    size: Option<u64>,
    /// Bytes already in the .part file (resumable).
    partial: u64,
    total: u64,
    downloading: bool,
}

#[derive(Clone, Serialize)]
struct Progress {
    received: u64,
    total: u64,
}

fn part_name() -> String {
    format!("{MODEL_FILE}.part")
}

#[tauri::command(async)]
pub fn model_status(app: AppHandle, state: State<Download>) -> Result<ModelStatus, String> {
    let dir = models_dir(&app)?;

    Ok(ModelStatus {
        size: fs::metadata(dir.join(MODEL_FILE)).ok().map(|m| m.len()),
        partial: fs::metadata(dir.join(part_name())).map_or(0, |m| m.len()),
        total: MODEL_SIZE,
        downloading: state.active.load(Ordering::Relaxed),
        dir: dir.to_string_lossy().into_owned(),
    })
}

/// Download (or resume) and verify. Errors: "cancelled", "hash-mismatch", or a message.
#[tauri::command]
pub async fn model_download(app: AppHandle, state: State<'_, Download>) -> Result<(), String> {
    if state.active.swap(true, Ordering::SeqCst) {
        return Err("already downloading".into());
    }

    state.cancel.store(false, Ordering::SeqCst);

    let result = download_model(&app, &state.cancel).await;

    state.active.store(false, Ordering::SeqCst);
    result
}

/// Pause: the running download stops at its next chunk and keeps the .part file.
#[tauri::command]
pub fn model_download_cancel(state: State<Download>) {
    state.cancel.store(true, Ordering::SeqCst);
}

async fn download_model(app: &AppHandle, cancel: &AtomicBool) -> Result<(), String> {
    let dir = models_dir(app)?;

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let part = dir.join(part_name());
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    // A dropped connection resumes from the .part file a few times before the user has to press 이어받기.
    let mut retries = 0;

    loop {
        let result = fetch_resumable(&client, MODEL_URL, &part, MODEL_SIZE, cancel, |received| {
            let _ = app.emit("model-download", Progress { received, total: MODEL_SIZE });
        })
        .await;

        match result {
            Ok(()) => break,
            Err(error) if error == "cancelled" || error.starts_with("HTTP 4") || retries >= RETRIES => {
                return Err(error);
            }
            Err(_) => {
                retries += 1;
                let wait = Duration::from_secs(3 * u64::from(retries));
                let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(wait)).await;
            }
        }
    }

    let hashed = part.clone();
    let actual = tauri::async_runtime::spawn_blocking(move || sha256_file(&hashed))
        .await
        .map_err(|e| e.to_string())??;

    finish(&part, &dir.join(MODEL_FILE), &actual, MODEL_SHA256)
}

/// Fill `part` up to `total` bytes from `url`, continuing from what is already there.
async fn fetch_resumable(
    client: &Client,
    url: &str,
    part: &Path,
    total: u64,
    cancel: &AtomicBool,
    progress: impl Fn(u64),
) -> Result<(), String> {
    let mut have = fs::metadata(part).map_or(0, |m| m.len());

    if have > total {
        fs::remove_file(part).map_err(|e| e.to_string())?;
        have = 0;
    }

    if have == total {
        progress(have);

        return Ok(());
    }

    let mut request = client.get(url);

    if have > 0 {
        request = request.header(RANGE, format!("bytes={have}-"));
    }

    let mut response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();

    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }

    // A server that ignores Range sends the whole file: start over.
    if status != StatusCode::PARTIAL_CONTENT {
        have = 0;
    }

    let mut file = if have == 0 {
        File::create(part)
    } else {
        OpenOptions::new().append(true).open(part)
    }
    .map_err(|e| e.to_string())?;
    let mut reported = have;

    progress(have);

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }

        file.write_all(&chunk).map_err(|e| e.to_string())?;
        have += chunk.len() as u64;

        if have - reported >= PROGRESS_STEP {
            progress(have);
            reported = have;
        }
    }

    file.sync_all().map_err(|e| e.to_string())?;
    progress(have);

    if have != total {
        return Err(format!("incomplete download ({have}/{total} bytes)"));
    }

    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];

    loop {
        let read = file.read(&mut buffer).map_err(|e| e.to_string())?;

        if read == 0 {
            break;
        }

        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Rename to the final name only when the hash matches; otherwise delete the bad file.
fn finish(part: &Path, target: &Path, actual: &str, expected: &str) -> Result<(), String> {
    if actual != expected {
        fs::remove_file(part).map_err(|e| e.to_string())?;

        return Err("hash-mismatch".into());
    }

    fs::rename(part, target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    /// A one-file HTTP server on 127.0.0.1 that honours `Range: bytes=N-`. Records each Range seen.
    fn serve(body: Vec<u8>, ranges: Arc<Mutex<Vec<Option<u64>>>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/model.gguf", listener.local_addr().unwrap());

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut start = None;

                loop {
                    let mut line = String::new();

                    reader.read_line(&mut line).unwrap();

                    if line.trim().is_empty() {
                        break;
                    }

                    if let Some(value) = line.to_ascii_lowercase().strip_prefix("range: bytes=") {
                        start = value.trim().trim_end_matches('-').parse::<u64>().ok();
                    }
                }

                ranges.lock().unwrap().push(start);

                let from = start.unwrap_or(0) as usize;
                let status = if start.is_some() { "206 Partial Content" } else { "200 OK" };
                let head = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len() - from);

                stream.write_all(head.as_bytes()).unwrap();
                stream.write_all(&body[from..]).unwrap();
            }
        });

        url
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("malplan-test-{name}-{}", std::process::id()));

        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn body() -> Vec<u8> {
        (0..10_000u32).map(|i| (i % 251) as u8).collect()
    }

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn downloads_resumes_and_verifies() {
        let body = body();
        let ranges = Arc::new(Mutex::new(Vec::new()));
        let url = serve(body.clone(), ranges.clone());
        let dir = temp_dir("resume");
        let part = dir.join("m.part");
        let target = dir.join("m.gguf");
        let client = Client::new();
        let cancel = AtomicBool::new(false);
        let last = Mutex::new(0);

        // An earlier, interrupted run left the first 3000 bytes.
        fs::write(&part, &body[..3000]).unwrap();

        tauri::async_runtime::block_on(fetch_resumable(&client, &url, &part, body.len() as u64, &cancel, |n| {
            *last.lock().unwrap() = n;
        }))
        .unwrap();

        assert_eq!(*ranges.lock().unwrap(), vec![Some(3000)]);
        assert_eq!(*last.lock().unwrap(), body.len() as u64);
        assert_eq!(fs::read(&part).unwrap(), body);

        finish(&part, &target, &sha256_file(&part).unwrap(), &sha256(&body)).unwrap();
        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(!part.exists());
    }

    #[test]
    fn fresh_download_without_range() {
        let body = body();
        let ranges = Arc::new(Mutex::new(Vec::new()));
        let url = serve(body.clone(), ranges.clone());
        let part = temp_dir("fresh").join("m.part");
        let cancel = AtomicBool::new(false);

        tauri::async_runtime::block_on(fetch_resumable(&Client::new(), &url, &part, body.len() as u64, &cancel, |_| {})).unwrap();

        assert_eq!(*ranges.lock().unwrap(), vec![None]);
        assert_eq!(fs::read(&part).unwrap(), body);
    }

    #[test]
    fn cancel_keeps_the_part_file() {
        let body = body();
        let url = serve(body.clone(), Arc::new(Mutex::new(Vec::new())));
        let part = temp_dir("cancel").join("m.part");
        let cancel = AtomicBool::new(true);

        let result = tauri::async_runtime::block_on(fetch_resumable(&Client::new(), &url, &part, body.len() as u64, &cancel, |_| {}));

        assert_eq!(result, Err("cancelled".to_string()));
        assert!(part.exists());
    }

    #[test]
    fn hash_mismatch_deletes_the_file() {
        let dir = temp_dir("mismatch");
        let part = dir.join("m.part");
        let target = dir.join("m.gguf");

        fs::write(&part, b"not the model").unwrap();

        assert_eq!(finish(&part, &target, &sha256_file(&part).unwrap(), MODEL_SHA256), Err("hash-mismatch".to_string()));
        assert!(!part.exists());
        assert!(!target.exists());
    }
}
