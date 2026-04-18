use crate::error::Result;
use crate::session::SessionPool;
use crate::transfer::queue::{TransferQueue, TransferState};

pub struct TransferWorker {
    pub sessions: SessionPool,
    pub queue: TransferQueue,
}

impl TransferWorker {
    pub fn new(sessions: SessionPool, queue: TransferQueue) -> Self {
        Self { sessions, queue }
    }

    pub async fn run_once(&self, id: &str) -> Result<()> {
        self.queue.set_state(id, TransferState::Running).await;
        self.queue.set_state(id, TransferState::Done).await;
        Ok(())
    }
}
