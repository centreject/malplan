mod llm_server;
mod model_download;
mod sync_files;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Size and position only: a window hidden to the tray at quit must still open next time.
const WINDOW_STATE: StateFlags = StateFlags::all().difference(StateFlags::VISIBLE);

/// Whether the window close button hides to the tray. The frontend owns the
/// persisted setting and pushes it here on startup and on change.
struct CloseToTray(AtomicBool);

#[tauri::command]
fn set_close_to_tray(state: tauri::State<CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so a second launch exits before touching the sync files or the llama-server port.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(WINDOW_STATE)
                .build(),
        )
        // A small rotating log in the app's log folder, so a problem on someone's PC can be read afterwards.
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: None },
                ))
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // The frontend registers the shortcut; showing the window happens here
        // because a hidden webview may not run JS until it is visible again.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        show_main(app);
                    }
                })
                .build(),
        )
        .manage(CloseToTray(AtomicBool::new(true)))
        .manage(llm_server::LlmServer::default())
        .manage(model_download::Download::default())
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            sync_files::sync_default_dir,
            sync_files::sync_list,
            sync_files::sync_read,
            sync_files::sync_write,
            sync_files::sync_append,
            sync_files::save_text_file,
            llm_server::llm_start,
            llm_server::llm_stop,
            llm_server::llm_running,
            llm_server::model_delete,
            model_download::model_status,
            model_download::model_download,
            model_download::model_download_cancel,
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("malplan")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<CloseToTray>().0.load(Ordering::Relaxed) {
                    api.prevent_close();
                    // The app usually lives in the tray until Windows shuts down, which may never
                    // run the exit hook: keep the size and position from this moment.
                    let _ = window.app_handle().save_window_state(WINDOW_STATE);
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Never leave llama-server running after the app is gone.
            if let RunEvent::Exit = event {
                llm_server::stop(app);
            }
        });
}
