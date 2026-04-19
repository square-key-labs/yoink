use crate::error::Result;
use crate::transfer::TransferControl;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolKind {
    Sftp,
    Ftp,
    Ftps,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Auth {
    Password {
        password: String,
    },
    Key {
        private_key: String,
        passphrase: Option<String>,
    },
    Agent,
}

impl Zeroize for Auth {
    fn zeroize(&mut self) {
        match self {
            Auth::Password { password } => password.zeroize(),
            Auth::Key {
                private_key,
                passphrase,
            } => {
                private_key.zeroize();
                if let Some(p) = passphrase {
                    p.zeroize();
                }
            }
            Auth::Agent => {}
        }
    }
}

impl Drop for Auth {
    fn drop(&mut self) {
        self.zeroize();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub kind: ProtocolKind,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: Auth,
    #[serde(default)]
    pub passive: bool,
    #[serde(default)]
    pub verify_host: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Dir,
    Symlink,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    pub size: u64,
    pub modified_unix: Option<i64>,
    pub permissions: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TransferProgress {
    pub transfer_id: String,
    pub bytes_done: u64,
    pub total_bytes: u64,
}

#[async_trait]
pub trait Protocol: Send + Sync {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<()>;
    async fn disconnect(&mut self) -> Result<()>;
    async fn list_dir(&mut self, path: &str) -> Result<Vec<FileEntry>>;
    async fn stat(&mut self, path: &str) -> Result<FileEntry>;
    async fn mkdir(&mut self, path: &str) -> Result<()>;
    async fn remove(&mut self, path: &str) -> Result<()>;
    async fn rename(&mut self, from: &str, to: &str) -> Result<()>;
    async fn chmod(&mut self, path: &str, mode: u32) -> Result<()>;
    async fn upload(
        &mut self,
        local: &str,
        remote: &str,
        resume_from: u64,
        on_progress: &(dyn Fn(u64) + Send + Sync),
        control: &(dyn TransferControl + Send + Sync),
    ) -> Result<()>;
    async fn download(
        &mut self,
        remote: &str,
        local: &str,
        resume_from: u64,
        on_progress: &(dyn Fn(u64) + Send + Sync),
        control: &(dyn TransferControl + Send + Sync),
    ) -> Result<()>;
}
