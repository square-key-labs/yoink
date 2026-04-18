use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
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

#[derive(Default, Clone)]
pub struct TransferQueue {
    inner: Arc<Mutex<VecDeque<Transfer>>>,
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
}
