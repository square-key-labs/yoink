use crate::error::{Result, YoinkError};
use crate::protocols::traits::{ConnectionConfig, EntryKind, FileEntry, Protocol};
use async_trait::async_trait;

pub struct FtpProtocol {
    connected: bool,
    tls: bool,
}

impl FtpProtocol {
    pub fn new(tls: bool) -> Self {
        Self { connected: false, tls }
    }
}

#[async_trait]
impl Protocol for FtpProtocol {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<()> {
        let _ = (config.host.as_str(), config.port, self.tls);
        self.connected = true;
        Err(YoinkError::Other(
            "FTP/FTPS connect not yet implemented — suppaftp session pending".into(),
        ))
    }

    async fn disconnect(&mut self) -> Result<()> {
        self.connected = false;
        Ok(())
    }

    async fn list_dir(&mut self, _path: &str) -> Result<Vec<FileEntry>> {
        self.assert_connected()?;
        Ok(vec![])
    }

    async fn stat(&mut self, path: &str) -> Result<FileEntry> {
        self.assert_connected()?;
        Ok(FileEntry {
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            path: path.to_string(),
            kind: EntryKind::Other,
            size: 0,
            modified_unix: None,
            permissions: None,
        })
    }

    async fn mkdir(&mut self, _path: &str) -> Result<()> {
        self.assert_connected()
    }

    async fn remove(&mut self, _path: &str) -> Result<()> {
        self.assert_connected()
    }

    async fn rename(&mut self, _from: &str, _to: &str) -> Result<()> {
        self.assert_connected()
    }

    async fn chmod(&mut self, _path: &str, _mode: u32) -> Result<()> {
        self.assert_connected()
    }

    async fn upload(
        &mut self,
        _local: &str,
        _remote: &str,
        _resume_from: u64,
        _on_progress: &dyn Fn(u64),
    ) -> Result<()> {
        self.assert_connected()
    }

    async fn download(
        &mut self,
        _remote: &str,
        _local: &str,
        _resume_from: u64,
        _on_progress: &dyn Fn(u64),
    ) -> Result<()> {
        self.assert_connected()
    }
}

impl FtpProtocol {
    fn assert_connected(&self) -> Result<()> {
        if self.connected {
            Ok(())
        } else {
            Err(YoinkError::NotConnected)
        }
    }
}
