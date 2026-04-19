use crate::error::{Result, YoinkError};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
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
    /// Unix-seconds when this transfer last entered a terminal state
    /// (done/failed/cancelled). Used to prune stale entries on next load.
    #[serde(default)]
    pub terminal_at: Option<i64>,
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn is_terminal(state: TransferState) -> bool {
    matches!(
        state,
        TransferState::Done | TransferState::Failed | TransferState::Cancelled
    )
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

#[derive(Serialize, Deserialize)]
struct PersistFile {
    version: u32,
    transfers: Vec<Transfer>,
}

#[derive(Default, Clone)]
pub struct TransferQueue {
    inner: Arc<Mutex<VecDeque<Transfer>>>,
    controls: Arc<Mutex<HashMap<String, Arc<AtomicControl>>>>,
    /// Set to true while a coalesced save is already scheduled.
    save_scheduled: Arc<AtomicBool>,
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
            terminal_at: None,
        };
        self.inner.lock().await.push_back(t.clone());
        self.schedule_save();
        t
    }

    pub async fn snapshot(&self) -> Vec<Transfer> {
        self.inner.lock().await.iter().cloned().collect()
    }

    pub async fn set_state(&self, id: &str, state: TransferState) {
        let mut q = self.inner.lock().await;
        if let Some(t) = q.iter_mut().find(|t| t.id == id) {
            t.state = state;
            if is_terminal(state) {
                t.terminal_at = Some(now_unix());
            }
        }
        drop(q);
        self.schedule_save();
    }

    pub async fn set_progress(&self, id: &str, bytes_done: u64) {
        let mut q = self.inner.lock().await;
        if let Some(t) = q.iter_mut().find(|t| t.id == id) {
            t.bytes_done = bytes_done;
        }
        drop(q);
        // Progress updates fire at high frequency; rely on the coalescing
        // scheduler so we don't hammer the disk.
        self.schedule_save();
    }

    pub async fn fail(&self, id: &str, reason: String) {
        let mut q = self.inner.lock().await;
        if let Some(t) = q.iter_mut().find(|t| t.id == id) {
            t.state = TransferState::Failed;
            t.error = Some(reason);
            t.terminal_at = Some(now_unix());
        }
        drop(q);
        self.schedule_save();
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

    /// Path to `$DATA_DIR/Yoink/transfers.json` (e.g.
    /// `$HOME/Library/Application Support/Yoink/transfers.json` on macOS).
    pub fn persist_dir() -> Result<PathBuf> {
        let mut p = dirs::data_dir().ok_or_else(|| YoinkError::Other("no data dir".into()))?;
        p.push("Yoink");
        Ok(p)
    }

    fn persist_path() -> Result<PathBuf> {
        let mut p = Self::persist_dir()?;
        p.push("transfers.json");
        Ok(p)
    }

    /// Synchronous write of the current queue snapshot. Writes atomically via a
    /// sibling `.tmp` file + rename so readers never see a half-written file.
    pub async fn save(&self) -> Result<()> {
        let snapshot: Vec<Transfer> = self.inner.lock().await.iter().cloned().collect();
        let path = Self::persist_path()?;
        let dir = Self::persist_dir()?;
        let payload = PersistFile {
            version: 1,
            transfers: snapshot,
        };
        let bytes = serde_json::to_vec_pretty(&payload)
            .map_err(|e| YoinkError::Other(format!("serialize transfers: {e}")))?;
        tokio::task::spawn_blocking(move || -> Result<()> {
            std::fs::create_dir_all(&dir)?;
            let tmp = path.with_extension("json.tmp");
            std::fs::write(&tmp, &bytes)?;
            std::fs::rename(&tmp, &path)?;
            Ok(())
        })
        .await
        .map_err(|e| YoinkError::Other(format!("save join: {e}")))??;
        Ok(())
    }

    /// Schedule a coalesced save on the tokio runtime. Many rapid mutations
    /// (progress ticks) collapse into a single disk write.
    fn schedule_save(&self) {
        if self
            .save_scheduled
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        let this = self.clone();
        tokio::spawn(async move {
            // Debounce window — collect bursts of updates.
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            this.save_scheduled.store(false, Ordering::SeqCst);
            if let Err(e) = this.save().await {
                tracing::warn!("transfer queue save failed: {e}");
            }
        });
    }

    /// Load the persisted queue from disk. Running/queued transfers are
    /// downgraded to Paused (nothing is actually running after a restart).
    /// Terminal entries older than 24h are pruned.
    pub fn load_on_start() -> Self {
        let deque = Self::load_deque().unwrap_or_default();
        Self {
            inner: Arc::new(Mutex::new(deque)),
            controls: Arc::new(Mutex::new(HashMap::new())),
            save_scheduled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn load_deque() -> Option<VecDeque<Transfer>> {
        let path = Self::persist_path().ok()?;
        let bytes = std::fs::read(&path).ok()?;
        let file: PersistFile = match serde_json::from_slice(&bytes) {
            Ok(f) => f,
            Err(_) => {
                tracing::warn!("transfers.json unreadable; starting with empty queue");
                return None;
            }
        };
        let cutoff = now_unix() - 24 * 60 * 60;
        let mut deque: VecDeque<Transfer> = VecDeque::new();
        for mut t in file.transfers {
            match t.state {
                TransferState::Running | TransferState::Queued => {
                    // Nothing is running post-restart — ask user to resume.
                    t.state = TransferState::Paused;
                    deque.push_back(t);
                }
                TransferState::Paused => {
                    deque.push_back(t);
                }
                TransferState::Done | TransferState::Failed | TransferState::Cancelled => {
                    if t.terminal_at.map(|ts| ts >= cutoff).unwrap_or(true) {
                        deque.push_back(t);
                    }
                    // else: prune entries older than 24h
                }
            }
        }
        Some(deque)
    }
}
