mod bookmarks;
mod commands;
mod error;
mod knownhosts;
mod protocols;
mod proxy;
mod session;
mod transfer;

use session::SessionPool;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
use transfer::TransferQueue;

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn apply_window_effects(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        let _ = apply_vibrancy(
            window,
            NSVisualEffectMaterial::Sidebar,
            Some(NSVisualEffectState::FollowsWindowActiveState),
            None,
        );
    }
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_mica;
        let _ = apply_mica(window, Some(true));
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_window_effects(_window: &tauri::WebviewWindow) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SessionPool::new())
        .manage(TransferQueue::load_on_start())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                apply_window_effects(&window);
            }

            let new_conn = MenuItemBuilder::new("New Connection…")
                .id("new_conn")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let close_tab = MenuItemBuilder::new("Close Tab")
                .id("close_tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;
            let prefs = MenuItemBuilder::new("Preferences…")
                .id("prefs")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_menu = SubmenuBuilder::new(app, "Yoink")
                .about(None)
                .separator()
                .item(&prefs)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_conn)
                .item(&close_tab)
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                let _ = app.emit("yoink://menu", event.id().0.clone());
            });

            let _ = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .unwrap_or_else(|| tauri::image::Image::new_owned(vec![], 0, 0)),
                )
                .tooltip("Yoink")
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::disconnect,
            commands::list_dir,
            commands::list_sessions,
            commands::remote_rename,
            commands::remote_remove,
            commands::remote_mkdir,
            commands::bookmarks_load,
            commands::bookmarks_save,
            commands::keychain_set_password,
            commands::keychain_get_password,
            commands::keychain_delete,
            commands::transfer_enqueue,
            commands::transfer_list,
            commands::transfer_pause,
            commands::transfer_resume,
            commands::transfer_cancel,
            commands::transfer_retry,
            commands::remote_stat,
            commands::accept_host_fingerprint,
            commands::get_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
