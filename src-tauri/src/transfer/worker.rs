use crate::error::YoinkError;
use crate::session::SessionPool;
use crate::transfer::queue::{Transfer, TransferDirection, TransferQueue, TransferState};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub fn spawn(app: AppHandle, sessions: SessionPool, queue: TransferQueue, transfer: Transfer) {
    tokio::spawn(async move {
        run(app, sessions, queue, transfer).await;
    });
}

async fn run(app: AppHandle, sessions: SessionPool, queue: TransferQueue, transfer: Transfer) {
    let id = transfer.id.clone();
    // Always start from whatever bytes_done is currently on record so retries
    // pick up from where we left off.
    let resume_from = transfer.bytes_done;

    // Fetch (creating if needed) the shared control flag and reset it to Run.
    let control = queue.control(&id).await;
    control.reset();

    queue.set_state(&id, TransferState::Running).await;
    let _ = app.emit(
        "yoink://transfer",
        serde_json::json!({"id": id, "state": "running"}),
    );

    let Some(session_arc) = sessions.get(&transfer.session_id).await else {
        queue.fail(&id, "session no longer open".into()).await;
        let _ = app.emit(
            "yoink://transfer",
            serde_json::json!({"id": id, "state": "failed", "error": "session no longer open"}),
        );
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

    let control_ref = control.clone();
    let outcome = {
        let mut session = session_arc.lock().await;
        match transfer.direction {
            TransferDirection::Upload => {
                session
                    .protocol
                    .upload(
                        &transfer.local_path,
                        &transfer.remote_path,
                        resume_from,
                        &cb_fn,
                        control_ref.as_ref(),
                    )
                    .await
            }
            TransferDirection::Download => {
                session
                    .protocol
                    .download(
                        &transfer.remote_path,
                        &transfer.local_path,
                        resume_from,
                        &cb_fn,
                        control_ref.as_ref(),
                    )
                    .await
            }
        }
    };

    match outcome {
        Ok(()) => {
            queue.set_state(&id, TransferState::Done).await;
            queue.clear_control(&id).await;
            let _ = app.emit(
                "yoink://transfer",
                serde_json::json!({"id": id, "state": "done"}),
            );
        }
        Err(YoinkError::Paused) => {
            queue.set_state(&id, TransferState::Paused).await;
            // Reset flag so the next resume starts cleanly.
            control.reset();
            let _ = app.emit(
                "yoink://transfer",
                serde_json::json!({"id": id, "state": "paused"}),
            );
        }
        Err(YoinkError::Cancelled) => {
            queue.set_state(&id, TransferState::Cancelled).await;
            queue.clear_control(&id).await;
            let _ = app.emit(
                "yoink://transfer",
                serde_json::json!({"id": id, "state": "cancelled"}),
            );
        }
        Err(e) => {
            queue.fail(&id, e.to_string()).await;
            queue.clear_control(&id).await;
            let _ = app.emit(
                "yoink://transfer",
                serde_json::json!({"id": id, "state": "failed", "error": e.to_string()}),
            );
        }
    }
}
