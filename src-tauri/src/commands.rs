use crate::bookmarks::{BookmarkStore, BookmarksFile, KeychainClient};
use crate::error::Result;
use crate::protocols::{ConnectionConfig, FileEntry};
use crate::session::{SessionId, SessionPool};
use crate::transfer::{Transfer, TransferDirection, TransferQueue};
use tauri::State;

#[tauri::command]
pub async fn connect(
    pool: State<'_, SessionPool>,
    config: ConnectionConfig,
) -> Result<SessionId> {
    pool.open(config).await
}

#[tauri::command]
pub async fn disconnect(pool: State<'_, SessionPool>, session_id: String) -> Result<()> {
    pool.close(&session_id).await
}

#[tauri::command]
pub async fn list_dir(
    pool: State<'_, SessionPool>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>> {
    pool.list_dir(&session_id, &path).await
}

#[tauri::command]
pub async fn list_sessions(pool: State<'_, SessionPool>) -> Result<Vec<SessionId>> {
    Ok(pool.ids().await)
}

#[tauri::command]
pub async fn bookmarks_load() -> Result<BookmarksFile> {
    let store = BookmarkStore::new(BookmarkStore::default_path()?)?;
    store.load()
}

#[tauri::command]
pub async fn bookmarks_save(file: BookmarksFile) -> Result<()> {
    let store = BookmarkStore::new(BookmarkStore::default_path()?)?;
    store.save(&file)
}

#[tauri::command]
pub async fn keychain_set_password(bookmark_id: String, password: String) -> Result<()> {
    KeychainClient::set_password(&bookmark_id, &password)
}

#[tauri::command]
pub async fn keychain_delete(bookmark_id: String, slot: String) -> Result<()> {
    KeychainClient::delete(&bookmark_id, &slot)
}

#[tauri::command]
pub async fn transfer_enqueue(
    queue: State<'_, TransferQueue>,
    session_id: String,
    direction: TransferDirection,
    local_path: String,
    remote_path: String,
    total_bytes: u64,
) -> Result<Transfer> {
    Ok(queue
        .enqueue(session_id, direction, local_path, remote_path, total_bytes)
        .await)
}

#[tauri::command]
pub async fn transfer_list(queue: State<'_, TransferQueue>) -> Result<Vec<Transfer>> {
    Ok(queue.snapshot().await)
}

#[tauri::command]
pub async fn get_theme() -> Result<String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            let p = home.join(".config/gtk-3.0/settings.ini");
            if let Ok(text) = std::fs::read_to_string(&p) {
                for line in text.lines() {
                    if let Some(v) = line.trim().strip_prefix("gtk-application-prefer-dark-theme") {
                        if v.contains('1') || v.to_lowercase().contains("true") {
                            return Ok("dark".to_string());
                        }
                    }
                }
            }
        }
        Ok("light".to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("system".to_string())
    }
}
