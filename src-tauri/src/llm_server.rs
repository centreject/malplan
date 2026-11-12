//! Thin process glue for the bundled llama-server. TypeScript decides when to start and stop;
//! the executable, model path and flags are fixed here so the frontend cannot run anything else.

use std::fs::{self, File};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// The one model the app runs (Qwen3 4B, Apache 2.0).
pub const MODEL_FILE: &str = "Qwen3-4B-Q4_K_M.gguf";

/// Where the running server listens and the key it takes. The app is its only client.
#[derive(Clone, Serialize)]
pub struct Connection {
    port: u16,
    key: String,
}

struct Running {
    child: Child,
    connection: Connection,
}

#[derive(Default)]
pub struct LlmServer(Mutex<Option<Running>>);

/// Local (not roaming) app data: a 2.5GB file must not follow a roaming profile.
pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("models"))
}

fn alive(slot: &mut Option<Running>) -> bool {
    slot.as_mut().is_some_and(|running| matches!(running.child.try_wait(), Ok(None)))
}

/// A free loopback port, so another program on a fixed port can never keep the server from starting.
fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;

    listener.local_addr().map(|addr| addr.port()).map_err(|e| e.to_string())
}

/// A new key per start (32 random bytes, hex).
fn new_key() -> Result<String, String> {
    let mut bytes = [0u8; 32];

    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;

    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Start the server unless it already runs, and return where it listens and its key. Errors with
/// "no-model" when the model is missing.
#[tauri::command(async)]
pub fn llm_start(app: AppHandle, state: State<LlmServer>) -> Result<Connection, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;

    if alive(&mut slot) {
        if let Some(running) = slot.as_ref() {
            return Ok(running.connection.clone());
        }
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
    let connection = Connection { port: free_port()?, key: new_key()? };
    let port = connection.port.to_string();
    let mut command = Command::new(exe);

    command
        .arg("-m")
        .arg(model)
        .args(["--host", "127.0.0.1", "--port", &port, "-c", "2048", "-np", "1", "--jinja"])
        .args(["--chat-template-kwargs", r#"{"enable_thinking":false}"#])
        // Only what the app uses. It calls from Rust (the HTTP plugin), so no browser origin needs access.
        .args(["--no-slots", "--no-webui", "--cors-origins", "http://tauri.localhost"])
        // In the environment, not the command line, which other programs can list.
        .env("LLAMA_API_KEY", &connection.key)
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn().map_err(|e| format!("llama-server: {e}"))?;

    #[cfg(windows)]
    kill_with_app(&child);

    *slot = Some(Running { child, connection: connection.clone() });

    Ok(connection)
}

/// Put the child in a Job Object that kills it when the job's last handle closes, i.e. when this
/// process ends for any reason, a crash included. The job handle is never closed on purpose.
/// Best effort: without it, RunEvent::Exit still stops the server on a normal exit.
#[cfg(windows)]
fn kill_with_app(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;

    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    // Stored as usize because a raw HANDLE is not Sync; 0 means the job could not be made.
    static JOB: OnceLock<usize> = OnceLock::new();

    let job = *JOB.get_or_init(|| {
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();

        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let size = u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>()).unwrap_or(0);

        // SAFETY: null attributes and name are allowed; `info` outlives the call and `size` is its size.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());

            if job.is_null()
                || SetInformationJobObject(job, JobObjectExtendedLimitInformation, (&raw const info).cast(), size) == 0
            {
                return 0;
            }

            job as usize
        }
    });

    if job != 0 {
        // SAFETY: `job` is a live job handle (never closed); the child's handle is valid while `child` lives.
        unsafe {
            AssignProcessToJobObject(job as _, child.as_raw_handle());
        }
    }
}

/// Kill the server if it runs. Also called on app exit and before deleting the model.
pub fn stop(app: &AppHandle) {
    if let Ok(mut slot) = app.state::<LlmServer>().0.lock() {
        if let Some(mut running) = slot.take() {
            let _ = running.child.kill();
            let _ = running.child.wait();
        }
    }
}

#[tauri::command(async)]
pub fn llm_stop(app: AppHandle) {
    stop(&app);
}

#[tauri::command]
pub fn llm_running(state: State<LlmServer>) -> bool {
    state.0.lock().is_ok_and(|mut slot| alive(&mut slot))
}

/// Remove the model (and any partial download) to give the space back.
#[tauri::command(async)]
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
