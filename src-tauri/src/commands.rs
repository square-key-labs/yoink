use crate::bookmarks::{BookmarkStore, BookmarksFile, KeychainClient};
use crate::error::Result;
use crate::protocols::{ConnectionConfig, FileEntry};
use crate::session::{SessionId, SessionPool};
use crate::transfer::{worker, Transfer, TransferDirection, TransferQueue, TransferState};
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn connect(pool: State<'_, SessionPool>, config: ConnectionConfig) -> Result<SessionId> {
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
pub async fn remote_rename(
    pool: State<'_, SessionPool>,
    session_id: String,
    from: String,
    to: String,
) -> Result<()> {
    let session = pool
        .get(&session_id)
        .await
        .ok_or(crate::error::YoinkError::NotConnected)?;
    let mut s = session.lock().await;
    s.protocol.rename(&from, &to).await
}

#[tauri::command]
pub async fn remote_remove(
    pool: State<'_, SessionPool>,
    session_id: String,
    path: String,
) -> Result<()> {
    let session = pool
        .get(&session_id)
        .await
        .ok_or(crate::error::YoinkError::NotConnected)?;
    let mut s = session.lock().await;
    s.protocol.remove(&path).await
}

#[tauri::command]
pub async fn remote_mkdir(
    pool: State<'_, SessionPool>,
    session_id: String,
    path: String,
) -> Result<()> {
    let session = pool
        .get(&session_id)
        .await
        .ok_or(crate::error::YoinkError::NotConnected)?;
    let mut s = session.lock().await;
    s.protocol.mkdir(&path).await
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
pub async fn keychain_get_password(bookmark_id: String) -> Result<Option<String>> {
    match KeychainClient::get_password(&bookmark_id) {
        Ok(p) => Ok(Some(p)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn keychain_delete(bookmark_id: String, slot: String) -> Result<()> {
    KeychainClient::delete(&bookmark_id, &slot)
}

#[tauri::command]
pub async fn transfer_enqueue(
    app: AppHandle,
    pool: State<'_, SessionPool>,
    queue: State<'_, TransferQueue>,
    session_id: String,
    direction: TransferDirection,
    local_path: String,
    remote_path: String,
    total_bytes: u64,
) -> Result<Transfer> {
    let t = queue
        .enqueue(session_id, direction, local_path, remote_path, total_bytes)
        .await;
    worker::spawn(app, (*pool).clone(), (*queue).clone(), t.clone());
    Ok(t)
}

#[tauri::command]
pub async fn transfer_list(queue: State<'_, TransferQueue>) -> Result<Vec<Transfer>> {
    Ok(queue.snapshot().await)
}

#[tauri::command]
pub async fn transfer_pause(queue: State<'_, TransferQueue>, id: String) -> Result<()> {
    queue.request_pause(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn transfer_cancel(queue: State<'_, TransferQueue>, id: String) -> Result<()> {
    queue.request_cancel(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn transfer_resume(
    app: AppHandle,
    pool: State<'_, SessionPool>,
    queue: State<'_, TransferQueue>,
    id: String,
) -> Result<()> {
    let Some(t) = queue.get(&id).await else {
        return Ok(());
    };
    if !matches!(t.state, TransferState::Paused) {
        return Ok(());
    }
    queue.set_state(&id, TransferState::Queued).await;
    let _ = app.emit(
        "yoink://transfer",
        serde_json::json!({"id": id, "state": "queued"}),
    );
    worker::spawn(app, (*pool).clone(), (*queue).clone(), t);
    Ok(())
}

#[tauri::command]
pub async fn transfer_retry(
    app: AppHandle,
    pool: State<'_, SessionPool>,
    queue: State<'_, TransferQueue>,
    id: String,
) -> Result<()> {
    let Some(t) = queue.get(&id).await else {
        return Ok(());
    };
    // Re-enqueue at current bytes_done offset (worker reads resume from transfer.bytes_done).
    queue.set_state(&id, TransferState::Queued).await;
    let _ = app.emit(
        "yoink://transfer",
        serde_json::json!({"id": id, "state": "queued"}),
    );
    worker::spawn(app, (*pool).clone(), (*queue).clone(), t);
    Ok(())
}

#[tauri::command]
pub async fn remote_stat(
    pool: State<'_, SessionPool>,
    session_id: String,
    path: String,
) -> Result<Option<FileEntry>> {
    let session = pool
        .get(&session_id)
        .await
        .ok_or(crate::error::YoinkError::NotConnected)?;
    let mut s = session.lock().await;
    match s.protocol.stat(&path).await {
        Ok(entry) => Ok(Some(entry)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn get_theme() -> Result<String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            let p = home.join(".config/gtk-3.0/settings.ini");
            if let Ok(text) = std::fs::read_to_string(&p) {
                for line in text.lines() {
                    if let Some(v) = line
                        .trim()
                        .strip_prefix("gtk-application-prefer-dark-theme")
                    {
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
