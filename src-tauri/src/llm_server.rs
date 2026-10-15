//! Thin process glue for the bundled llama-server. TypeScript decides when to start and stop;
//! the executable, model path and flags are fixed here so the frontend cannot run anything else.

use std::fs::{self, File};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

/// The one model the app runs (Qwen3 4B, Apache 2.0).
pub const MODEL_FILE: &str = "Qwen3-4B-Q4_K_M.gguf";

/// Must match LOCAL_ORIGIN in src/llm/localServer.ts.
const PORT: &str = "8357";

#[derive(Default)]
pub struct LlmServer(Mutex<Option<Child>>);

/// Local (not roaming) app data: a 2.5GB file must not follow a roaming profile.
pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("models"))
}

fn alive(slot: &mut Option<Child>) -> bool {
    slot.as_mut().is_some_and(|child| matches!(child.try_wait(), Ok(None)))
}

/// Start the server unless it already runs. Errors with "no-model" when the model is missing.
#[tauri::command]
pub fn llm_start(app: AppHandle, state: State<LlmServer>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;

    if alive(&mut slot) {
        return Ok(());
    }

    let dir = models_dir(&app)?;
    let model = dir.join(MODEL_FILE);

    if !model.is_file() {
        return Err("no-model".into());
    }

    let exe = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("llama")
        .join(format!("llama-server{}", std::env::consts::EXE_SUFFIX));
    // Last run's output, for diagnosing an "error" status.
    let log = File::create(dir.join("llama-server.log")).map_err(|e| e.to_string())?;
    let mut command = Command::new(exe);

    command
        .arg("-m")
        .arg(model)
        .args(["--host", "127.0.0.1", "--port", PORT, "-c", "2048", "-np", "1", "--jinja"])
        .args(["--chat-template-kwargs", r#"{"enable_thinking":false}"#])
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    *slot = Some(command.spawn().map_err(|e| format!("llama-server: {e}"))?);

    Ok(())
}

/// Kill the server if it runs. Also called on app exit and before deleting the model.
pub fn stop(app: &AppHandle) {
    if let Ok(mut slot) = app.state::<LlmServer>().0.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
pub fn llm_stop(app: AppHandle) {
    stop(&app);
}

#[tauri::command]
pub fn llm_running(state: State<LlmServer>) -> bool {
    state.0.lock().is_ok_and(|mut slot| alive(&mut slot))
}

/// Remove the model (and any partial download) to give the space back.
#[tauri::command]
pub fn model_delete(app: AppHandle) -> Result<(), String> {
    stop(&app);

    let dir = models_dir(&app)?;

    for name in [MODEL_FILE.to_string(), format!("{MODEL_FILE}.part")] {
        match fs::remove_file(dir.join(name)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }

    Ok(())
}
