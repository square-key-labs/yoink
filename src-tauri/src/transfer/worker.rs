use crate::session::SessionPool;
use crate::transfer::queue::{Transfer, TransferDirection, TransferQueue, TransferState};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub fn spawn(
    app: AppHandle,
    sessions: SessionPool,
    queue: TransferQueue,
    transfer: Transfer,
) {
    tokio::spawn(async move {
        run(app, sessions, queue, transfer).await;
    });
}

async fn run(
    app: AppHandle,
    sessions: SessionPool,
    queue: TransferQueue,
    transfer: Transfer,
) {
    let id = transfer.id.clone();
    queue.set_state(&id, TransferState::Running).await;
    let _ = app.emit("yoink://transfer", serde_json::json!({"id": id, "state": "running"}));

    let Some(session_arc) = sessions.get(&transfer.session_id).await else {
        queue
            .fail(&id, "session no longer open".into())
            .await;
        return;
    };

    let queue_cb = queue.clone();
    let app_cb = app.clone();
    let id_cb = id.clone();
    let on_progress = Arc::new(move |bytes: u64| {
        let q = queue_cb.clone();
        let a = app_cb.clone();
        let ident = id_cb.clone();
        tokio::spawn(async move {
            q.set_progress(&ident, bytes).await;
            let _ = a.emit(
                "yoink://transfer",
                serde_json::json!({"id": ident, "bytes_done": bytes}),
            );
        });
    });
    let cb_fn = {
        let cb = on_progress.clone();
        move |b: u64| cb(b)
    };

    let outcome = {
        let mut session = session_arc.lock().await;
        match transfer.direction {
            TransferDirection::Upload => {
                session
                    .protocol
                    .upload(&transfer.local_path, &transfer.remote_path, 0, &cb_fn)
                    .await
            }
            TransferDirection::Download => {
                session
                    .protocol
                    .download(&transfer.remote_path, &transfer.local_path, 0, &cb_fn)
                    .await
            }
        }
    };

    match outcome {
        Ok(()) => {
            queue.set_state(&id, TransferState::Done).await;
            let _ = app.emit(
                "yoink://transfer",
                serde_json::json!({"id": id, "state": "done"}),
            );
        }
        Err(e) => {
            queue.fail(&id, e.to_string()).await;
            let _ = app.emit(
                "yoink://transfer",
                serde_json::json!({"id": id, "state": "failed", "error": e.to_string()}),
            );
        }
    }
}
