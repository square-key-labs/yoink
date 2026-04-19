use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferState {
    Queued,
    Running,
    Paused,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: String,
    pub session_id: String,
    pub direction: TransferDirection,
    pub local_path: String,
    pub remote_path: String,
    pub total_bytes: u64,
    pub bytes_done: u64,
    pub state: TransferState,
    pub error: Option<String>,
}

/// Shared control flag for an in-flight transfer.
///
/// Values:
/// - 0 = Run (no action requested)
/// - 1 = Pause requested
/// - 2 = Cancel requested
const CTRL_RUN: u8 = 0;
const CTRL_PAUSE: u8 = 1;
const CTRL_CANCEL: u8 = 2;

/// Trait consumed by protocol impls to cooperatively pause/cancel a transfer.
pub trait TransferControl: Send + Sync {
    fn should_pause(&self) -> bool;
    fn should_cancel(&self) -> bool;
}

#[derive(Debug, Default)]
pub struct AtomicControl {
    flag: AtomicU8,
}

impl AtomicControl {
    pub fn new() -> Self {
        Self {
            flag: AtomicU8::new(CTRL_RUN),
        }
    }

    pub fn request_pause(&self) {
        self.flag.store(CTRL_PAUSE, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) {
        self.flag.store(CTRL_CANCEL, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.flag.store(CTRL_RUN, Ordering::SeqCst);
    }
}

impl TransferControl for AtomicControl {
    fn should_pause(&self) -> bool {
        self.flag.load(Ordering::SeqCst) == CTRL_PAUSE
    }

    fn should_cancel(&self) -> bool {
        self.flag.load(Ordering::SeqCst) == CTRL_CANCEL
    }
}

#[derive(Default, Clone)]
pub struct TransferQueue {
    inner: Arc<Mutex<VecDeque<Transfer>>>,
    controls: Arc<Mutex<HashMap<String, Arc<AtomicControl>>>>,
}

impl TransferQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn enqueue(
        &self,
        session_id: String,
        direction: TransferDirection,
        local_path: String,
        remote_path: String,
        total_bytes: u64,
    ) -> Transfer {
        let t = Transfer {
            id: Uuid::new_v4().to_string(),
            session_id,
            direction,
            local_path,
            remote_path,
            total_bytes,
            bytes_done: 0,
            state: TransferState::Queued,
            error: None,
        };
        self.inner.lock().await.push_back(t.clone());
        t
    }

    pub async fn snapshot(&self) -> Vec<Transfer> {
        self.inner.lock().await.iter().cloned().collect()
    }

    pub async fn set_state(&self, id: &str, state: TransferState) {
        let mut q = self.inner.lock().await;
        if let Some(t) = q.iter_mut().find(|t| t.id == id) {
            t.state = state;
        }
    }

    pub async fn set_progress(&self, id: &str, bytes_done: u64) {
        let mut q = self.inner.lock().await;
        if let Some(t) = q.iter_mut().find(|t| t.id == id) {
            t.bytes_done = bytes_done;
        }
    }

    pub async fn fail(&self, id: &str, reason: String) {
        let mut q = self.inner.lock().await;
        if let Some(t) = q.iter_mut().find(|t| t.id == id) {
            t.state = TransferState::Failed;
            t.error = Some(reason);
        }
    }

    pub async fn get(&self, id: &str) -> Option<Transfer> {
        self.inner.lock().await.iter().find(|t| t.id == id).cloned()
    }

    /// Obtain (or create) the control flag for a transfer id.
    pub async fn control(&self, id: &str) -> Arc<AtomicControl> {
        let mut map = self.controls.lock().await;
        map.entry(id.to_string())
            .or_insert_with(|| Arc::new(AtomicControl::new()))
            .clone()
    }

    pub async fn request_pause(&self, id: &str) {
        if let Some(c) = self.controls.lock().await.get(id) {
            c.request_pause();
        }
    }

    pub async fn request_cancel(&self, id: &str) {
        if let Some(c) = self.controls.lock().await.get(id) {
            c.request_cancel();
        }
    }

    pub async fn clear_control(&self, id: &str) {
        self.controls.lock().await.remove(id);
    }
}
