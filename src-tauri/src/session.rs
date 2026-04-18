use crate::error::Result;
use crate::protocols::{ConnectionConfig, FileEntry, Protocol, ProtocolKind};
use crate::protocols::ftp::FtpProtocol;
use crate::protocols::sftp::SftpProtocol;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

pub type SessionId = String;

pub struct Session {
    pub id: SessionId,
    pub config: ConnectionConfig,
    pub protocol: Box<dyn Protocol>,
}

#[derive(Default, Clone)]
pub struct SessionPool {
    inner: Arc<Mutex<HashMap<SessionId, Arc<Mutex<Session>>>>>,
}

impl SessionPool {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn open(&self, config: ConnectionConfig) -> Result<SessionId> {
        let id = Uuid::new_v4().to_string();
        let mut protocol: Box<dyn Protocol> = match config.kind {
            ProtocolKind::Sftp => Box::new(SftpProtocol::new()),
            ProtocolKind::Ftp => Box::new(FtpProtocol::new(false)),
            ProtocolKind::Ftps => Box::new(FtpProtocol::new(true)),
        };
        protocol.connect(&config).await?;
        let session = Session { id: id.clone(), config, protocol };
        self.inner.lock().await.insert(id.clone(), Arc::new(Mutex::new(session)));
        Ok(id)
    }

    pub async fn close(&self, id: &str) -> Result<()> {
        if let Some(session) = self.inner.lock().await.remove(id) {
            session.lock().await.protocol.disconnect().await?;
        }
        Ok(())
    }

    pub async fn list_dir(&self, id: &str, path: &str) -> Result<Vec<FileEntry>> {
        let session = {
            let guard = self.inner.lock().await;
            guard
                .get(id)
                .cloned()
                .ok_or_else(|| crate::error::YoinkError::NotConnected)?
        };
        let mut s = session.lock().await;
        s.protocol.list_dir(path).await
    }

    pub async fn ids(&self) -> Vec<SessionId> {
        self.inner.lock().await.keys().cloned().collect()
    }

    pub async fn get(&self, id: &str) -> Option<Arc<Mutex<Session>>> {
        self.inner.lock().await.get(id).cloned()
    }
}
