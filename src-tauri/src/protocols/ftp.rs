use crate::error::{Result, YoinkError};
use crate::protocols::traits::{Auth, ConnectionConfig, EntryKind, FileEntry, Protocol};
use crate::proxy;
use crate::transfer::TransferControl;
use async_trait::async_trait;
use std::str::FromStr;
use suppaftp::list::File as FtpListFile;
use suppaftp::tokio::AsyncFtpStream;
use suppaftp::types::FileType;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct FtpProtocol {
    stream: Option<AsyncFtpStream>,
    tls: bool,
}

impl FtpProtocol {
    pub fn new(tls: bool) -> Self {
        Self { stream: None, tls }
    }

    fn stream_mut(&mut self) -> Result<&mut AsyncFtpStream> {
        self.stream.as_mut().ok_or(YoinkError::NotConnected)
    }
}

fn map_ftp(e: suppaftp::FtpError) -> YoinkError {
    YoinkError::Protocol(format!("ftp: {e}"))
}

fn entry_kind_from_ftp(f: &FtpListFile) -> EntryKind {
    if f.is_directory() {
        EntryKind::Dir
    } else if f.is_symlink() {
        EntryKind::Symlink
    } else if f.is_file() {
        EntryKind::File
    } else {
        EntryKind::Other
    }
}

#[async_trait]
impl Protocol for FtpProtocol {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<()> {
        if self.tls {
            return Err(YoinkError::Other(
                "FTPS (TLS) not yet enabled — build suppaftp with the async-secure-rustls feature"
                    .into(),
            ));
        }
        let mut stream = if let Some(proxy_cfg) = &config.proxy {
            let tcp =
                proxy::connect_via_proxy(proxy_cfg, &config.host, config.port).await?;
            AsyncFtpStream::connect_with_stream(tcp).await.map_err(map_ftp)?
        } else {
            let addr = format!("{}:{}", config.host, config.port);
            AsyncFtpStream::connect(&addr).await.map_err(map_ftp)?
        };
        let password = match &config.auth {
            Auth::Password { password } => password.clone(),
            Auth::Key { .. } | Auth::Agent => {
                return Err(YoinkError::Other("FTP only supports password auth".into()))
            }
        };
        stream
            .login(&config.username, &password)
            .await
            .map_err(map_ftp)?;
        if config.passive {
            stream.set_mode(suppaftp::Mode::Passive);
        }
        stream
            .transfer_type(FileType::Binary)
            .await
            .map_err(map_ftp)?;
        self.stream = Some(stream);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        if let Some(mut s) = self.stream.take() {
            let _ = s.quit().await;
        }
        Ok(())
    }

    async fn list_dir(&mut self, path: &str) -> Result<Vec<FileEntry>> {
        let stream = self.stream_mut()?;
        let lines = stream.list(Some(path)).await.map_err(map_ftp)?;
        let mut out = Vec::new();
        for line in lines {
            if let Ok(file) = FtpListFile::from_str(&line) {
                let name = file.name().to_string();
                if name == "." || name == ".." {
                    continue;
                }
                let full = format!(
                    "{}{}{}",
                    path.trim_end_matches('/'),
                    if path == "/" { "" } else { "/" },
                    name
                );
                out.push(FileEntry {
                    name,
                    path: full,
                    kind: entry_kind_from_ftp(&file),
                    size: file.size() as u64,
                    modified_unix: Some(
                        file.modified()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0),
                    ),
                    permissions: None,
                });
            }
        }
        Ok(out)
    }

    async fn stat(&mut self, path: &str) -> Result<FileEntry> {
        let stream = self.stream_mut()?;
        let size = stream.size(path).await.map_err(map_ftp)?;
        Ok(FileEntry {
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            path: path.to_string(),
            kind: EntryKind::File,
            size: size as u64,
            modified_unix: None,
            permissions: None,
        })
    }

    async fn mkdir(&mut self, path: &str) -> Result<()> {
        let stream = self.stream_mut()?;
        stream.mkdir(path).await.map_err(map_ftp)?;
        Ok(())
    }

    async fn remove(&mut self, path: &str) -> Result<()> {
        let stream = self.stream_mut()?;
        if stream.rm(path).await.is_ok() {
            return Ok(());
        }
        stream.rmdir(path).await.map_err(map_ftp)?;
        Ok(())
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        let stream = self.stream_mut()?;
        stream.rename(from, to).await.map_err(map_ftp)?;
        Ok(())
    }

    async fn chmod(&mut self, _path: &str, _mode: u32) -> Result<()> {
        Err(YoinkError::Other(
            "chmod via FTP is non-standard (SITE CHMOD); not implemented".into(),
        ))
    }

    async fn upload(
        &mut self,
        local: &str,
        remote: &str,
        resume_from: u64,
        on_progress: &(dyn Fn(u64) + Send + Sync),
        control: &(dyn TransferControl + Send + Sync),
    ) -> Result<()> {
        let stream = self.stream_mut()?;
        let mut local_file = tokio::fs::File::open(local).await?;
        if resume_from > 0 {
            use tokio::io::AsyncSeekExt;
            local_file
                .seek(std::io::SeekFrom::Start(resume_from))
                .await?;
            stream
                .resume_transfer(resume_from as usize)
                .await
                .map_err(map_ftp)?;
        }
        let mut data = if resume_from > 0 {
            stream.append_with_stream(remote).await.map_err(map_ftp)?
        } else {
            stream.put_with_stream(remote).await.map_err(map_ftp)?
        };
        let mut buf = vec![0u8; 1024 * 1024];
        let mut total = resume_from;
        let outcome: Result<()> = loop {
            if control.should_cancel() {
                break Err(YoinkError::Cancelled);
            }
            if control.should_pause() {
                let _ = data.flush().await;
                break Err(YoinkError::Paused);
            }
            let n = match local_file.read(&mut buf).await {
                Ok(n) => n,
                Err(e) => break Err(e.into()),
            };
            if n == 0 {
                break Ok(());
            }
            if let Err(e) = data.write_all(&buf[..n]).await {
                break Err(e.into());
            }
            total += n as u64;
            on_progress(total);
        };
        // Always finalize the control-data stream to keep the session usable.
        let _ = data.flush().await;
        stream.finalize_put_stream(data).await.map_err(map_ftp)?;
        outcome
    }

    async fn download(
        &mut self,
        remote: &str,
        local: &str,
        resume_from: u64,
        on_progress: &(dyn Fn(u64) + Send + Sync),
        control: &(dyn TransferControl + Send + Sync),
    ) -> Result<()> {
        let stream = self.stream_mut()?;
        if resume_from > 0 {
            stream
                .resume_transfer(resume_from as usize)
                .await
                .map_err(map_ftp)?;
        }
        let mut data = stream.retr_as_stream(remote).await.map_err(map_ftp)?;
        let mut local_file = if resume_from > 0 {
            tokio::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .open(local)
                .await?
        } else {
            tokio::fs::File::create(local).await?
        };
        if resume_from > 0 {
            use tokio::io::AsyncSeekExt;
            local_file
                .seek(std::io::SeekFrom::Start(resume_from))
                .await?;
        }
        let mut buf = vec![0u8; 1024 * 1024];
        let mut total = resume_from;
        let outcome: Result<()> = loop {
            if control.should_cancel() {
                break Err(YoinkError::Cancelled);
            }
            if control.should_pause() {
                let _ = local_file.sync_all().await;
                break Err(YoinkError::Paused);
            }
            let n = match data.read(&mut buf).await {
                Ok(n) => n,
                Err(e) => break Err(e.into()),
            };
            if n == 0 {
                break Ok(());
            }
            if let Err(e) = local_file.write_all(&buf[..n]).await {
                break Err(e.into());
            }
            total += n as u64;
            on_progress(total);
        };
        let _ = local_file.sync_all().await;
        stream.finalize_retr_stream(data).await.map_err(map_ftp)?;
        outcome
    }
}
