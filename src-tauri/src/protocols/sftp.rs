use crate::error::{Result, YoinkError};
use crate::knownhosts::KnownHosts;
use crate::protocols::traits::{Auth, ConnectionConfig, EntryKind, FileEntry, Protocol};
use crate::proxy;
use crate::transfer::TransferControl;
use async_trait::async_trait;
use russh::client::{self, Handle, Msg};
use russh::keys::agent::AgentIdentity;
use russh::keys::ssh_key::PrivateKey;
use russh::keys::{Algorithm, EcdsaCurve};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKey};
use russh::{kex, Channel, Preferred};
use russh_sftp::client::SftpSession;
use std::borrow::Cow;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

struct ServerKeyCheck {
    host: String,
    port: u16,
    known: KnownHosts,
    outcome: Arc<Mutex<Option<HostKeyOutcome>>>,
}

#[derive(Debug, Clone)]
enum HostKeyOutcome {
    Accepted,
    Unknown { fingerprint: String },
    Mismatch,
}

impl client::Handler for ServerKeyCheck {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        let fp = server_public_key.fingerprint(HashAlg::Sha256).to_string();
        let stored = self.known.lookup(&self.host, self.port).ok().flatten();
        let outcome = match stored {
            Some(s) if s == fp => HostKeyOutcome::Accepted,
            Some(_) => HostKeyOutcome::Mismatch,
            None => HostKeyOutcome::Unknown { fingerprint: fp },
        };
        *self.outcome.lock().await = Some(outcome.clone());
        // Accept unknown keys in-line; outer layer persists to known_hosts.
        // Only reject on mismatch.
        Ok(!matches!(outcome, HostKeyOutcome::Mismatch))
    }
}

pub struct SftpProtocol {
    handle: Option<Handle<ServerKeyCheck>>,
    sftp: Option<SftpSession>,
}

impl SftpProtocol {
    pub fn new() -> Self {
        Self {
            handle: None,
            sftp: None,
        }
    }

    fn sftp_ref(&mut self) -> Result<&mut SftpSession> {
        self.sftp.as_mut().ok_or(YoinkError::NotConnected)
    }
}

impl Default for SftpProtocol {
    fn default() -> Self {
        Self::new()
    }
}

fn map_russh(e: russh::Error) -> YoinkError {
    YoinkError::Protocol(format!("ssh: {e}"))
}

fn map_sftp(e: russh_sftp::client::error::Error) -> YoinkError {
    YoinkError::Protocol(format!("sftp: {e}"))
}

fn entry_kind_from_perms(file_type: Option<u32>) -> EntryKind {
    match file_type {
        Some(m) if m & 0o040000 != 0 => EntryKind::Dir,
        Some(m) if m & 0o120000 != 0 => EntryKind::Symlink,
        Some(m) if m & 0o100000 != 0 => EntryKind::File,
        _ => EntryKind::Other,
    }
}

#[async_trait]
impl Protocol for SftpProtocol {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<()> {
        let known = KnownHosts::new(KnownHosts::default_path()?)?;
        let outcome = Arc::new(Mutex::new(None));
        let handler = ServerKeyCheck {
            host: config.host.clone(),
            port: config.port,
            known,
            outcome: outcome.clone(),
        };
        let mut cfg = client::Config::default();
        // Larger window + packet size → higher SFTP throughput on fast links.
        cfg.window_size = 8 * 1024 * 1024; // 8 MiB
        cfg.maximum_packet_size = 256 * 1024; // 256 KiB
        let defaults: Vec<kex::Name> = Preferred::DEFAULT.kex.iter().cloned().collect();
        let mut kex_list: Vec<kex::Name> = vec![
            kex::ECDH_SHA2_NISTP256,
            kex::ECDH_SHA2_NISTP384,
            kex::ECDH_SHA2_NISTP521,
        ];
        for k in defaults {
            if !kex_list.contains(&k) {
                kex_list.push(k);
            }
        }
        cfg.preferred.kex = Cow::Owned(kex_list);
        cfg.preferred.key = Cow::Owned(vec![
            Algorithm::Ed25519,
            Algorithm::Rsa {
                hash: Some(russh::keys::HashAlg::Sha512),
            },
            Algorithm::Rsa {
                hash: Some(russh::keys::HashAlg::Sha256),
            },
            Algorithm::Rsa { hash: None },
            Algorithm::Ecdsa {
                curve: EcdsaCurve::NistP256,
            },
            Algorithm::Ecdsa {
                curve: EcdsaCurve::NistP384,
            },
            Algorithm::Ecdsa {
                curve: EcdsaCurve::NistP521,
            },
        ]);
        let cfg = Arc::new(cfg);
        let mut handle = if let Some(proxy_cfg) = &config.proxy {
            let stream = proxy::connect_via_proxy(proxy_cfg, &config.host, config.port).await?;
            client::connect_stream(cfg, stream, handler)
                .await
                .map_err(map_russh)?
        } else {
            client::connect(cfg, (config.host.as_str(), config.port), handler)
                .await
                .map_err(map_russh)?
        };

        if let Some(o) = outcome.lock().await.clone() {
            match o {
                HostKeyOutcome::Accepted => {}
                HostKeyOutcome::Mismatch => {
                    return Err(YoinkError::HostKeyMismatch);
                }
                HostKeyOutcome::Unknown { fingerprint } => {
                    // TOFU: never auto-insert. Always require user confirmation
                    // via `accept_host_fingerprint` command, regardless of
                    // `verify_host`.
                    return Err(YoinkError::UnknownHost {
                        fingerprint,
                        host: config.host.clone(),
                        port: config.port,
                    });
                }
            }
        }

        let auth_ok = match &config.auth {
            Auth::Password { password } => handle
                .authenticate_password(&config.username, password)
                .await
                .map_err(map_russh)?
                .success(),
            Auth::Key {
                private_key,
                passphrase,
            } => {
                let key = PrivateKey::from_openssh(private_key)
                    .map_err(|e| YoinkError::Protocol(format!("key parse: {e}")))?;
                let key = if let Some(pass) = passphrase.as_deref().filter(|p| !p.is_empty()) {
                    key.decrypt(pass)
                        .map_err(|e| YoinkError::Protocol(format!("key decrypt: {e}")))?
                } else {
                    key
                };
                let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key), Some(HashAlg::Sha256));
                handle
                    .authenticate_publickey(&config.username, key_with_alg)
                    .await
                    .map_err(map_russh)?
                    .success()
            }
            Auth::Agent => {
                let mut agent = russh::keys::agent::client::AgentClient::connect_env()
                    .await
                    .map_err(|e| YoinkError::Protocol(format!("ssh-agent: {e}")))?;
                let identities = agent
                    .request_identities()
                    .await
                    .map_err(|e| YoinkError::Protocol(format!("ssh-agent: {e}")))?;
                if identities.is_empty() {
                    return Err(YoinkError::Other(
                        "ssh-agent has no identities loaded".into(),
                    ));
                }
                let mut ok = false;
                for id in identities {
                    let public_key = match id {
                        AgentIdentity::PublicKey { key, .. } => key,
                        // Certificate-backed identities are skipped; we would
                        // need authenticate_certificate_with for those.
                        AgentIdentity::Certificate { .. } => continue,
                    };
                    match handle
                        .authenticate_publickey_with(
                            &config.username,
                            public_key,
                            Some(HashAlg::Sha256),
                            &mut agent,
                        )
                        .await
                    {
                        Ok(res) if res.success() => {
                            ok = true;
                            break;
                        }
                        Ok(_) => continue,
                        Err(_) => continue,
                    }
                }
                ok
            }
        };
        if !auth_ok {
            return Err(YoinkError::Auth);
        }

        let channel: Channel<Msg> = handle.channel_open_session().await.map_err(map_russh)?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(map_russh)?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(map_sftp)?;

        self.handle = Some(handle);
        self.sftp = Some(sftp);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        self.sftp = None;
        if let Some(h) = self.handle.take() {
            let _ = h
                .disconnect(russh::Disconnect::ByApplication, "bye", "")
                .await;
        }
        Ok(())
    }

    async fn list_dir(&mut self, path: &str) -> Result<Vec<FileEntry>> {
        let sftp = self.sftp_ref()?;
        let entries = sftp.read_dir(path).await.map_err(map_sftp)?;
        let mut out = Vec::new();
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let md = entry.metadata();
            let full = format!(
                "{}{}{}",
                path.trim_end_matches('/'),
                if path == "/" { "" } else { "/" },
                name
            );
            out.push(FileEntry {
                name: name.to_string(),
                path: full,
                kind: entry_kind_from_perms(md.permissions),
                size: md.size.unwrap_or(0),
                modified_unix: md.mtime.map(|t| t as i64),
                permissions: md.permissions.map(|p| p & 0o7777),
            });
        }
        Ok(out)
    }

    async fn stat(&mut self, path: &str) -> Result<FileEntry> {
        let sftp = self.sftp_ref()?;
        let md = sftp.metadata(path).await.map_err(map_sftp)?;
        Ok(FileEntry {
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            path: path.to_string(),
            kind: entry_kind_from_perms(md.permissions),
            size: md.size.unwrap_or(0),
            modified_unix: md.mtime.map(|t| t as i64),
            permissions: md.permissions.map(|p| p & 0o7777),
        })
    }

    async fn mkdir(&mut self, path: &str) -> Result<()> {
        let sftp = self.sftp_ref()?;
        sftp.create_dir(path).await.map_err(map_sftp)?;
        Ok(())
    }

    async fn remove(&mut self, path: &str) -> Result<()> {
        let sftp = self.sftp_ref()?;
        let md = sftp.metadata(path).await.map_err(map_sftp)?;
        if entry_kind_from_perms(md.permissions) == EntryKind::Dir {
            sftp.remove_dir(path).await.map_err(map_sftp)?;
        } else {
            sftp.remove_file(path).await.map_err(map_sftp)?;
        }
        Ok(())
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        let sftp = self.sftp_ref()?;
        sftp.rename(from, to).await.map_err(map_sftp)?;
        Ok(())
    }

    async fn chmod(&mut self, path: &str, mode: u32) -> Result<()> {
        let sftp = self.sftp_ref()?;
        let mut attrs = russh_sftp::protocol::FileAttributes::default();
        attrs.permissions = Some(mode & 0o7777);
        sftp.set_metadata(path, attrs).await.map_err(map_sftp)?;
        Ok(())
    }

    async fn upload(
        &mut self,
        local: &str,
        remote: &str,
        resume_from: u64,
        on_progress: &(dyn Fn(u64) + Send + Sync),
        control: &(dyn TransferControl + Send + Sync),
    ) -> Result<()> {
        let sftp = self.sftp_ref()?;
        let mut local_file = tokio::fs::File::open(local).await?;
        if resume_from > 0 {
            use tokio::io::AsyncSeekExt;
            local_file
                .seek(std::io::SeekFrom::Start(resume_from))
                .await?;
        }
        let mut remote_file = if resume_from > 0 {
            let mut f = sftp
                .open_with_flags(
                    remote,
                    russh_sftp::protocol::OpenFlags::WRITE
                        | russh_sftp::protocol::OpenFlags::CREATE,
                )
                .await
                .map_err(map_sftp)?;
            use tokio::io::AsyncSeekExt;
            f.seek(std::io::SeekFrom::Start(resume_from)).await?;
            f
        } else {
            sftp.create(remote).await.map_err(map_sftp)?
        };

        let mut buf = vec![0u8; 1024 * 1024];
        let mut total = resume_from;
        loop {
            if control.should_cancel() {
                return Err(YoinkError::Cancelled);
            }
            if control.should_pause() {
                remote_file.flush().await?;
                return Err(YoinkError::Paused);
            }
            let n = local_file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            remote_file.write_all(&buf[..n]).await?;
            total += n as u64;
            on_progress(total);
        }
        remote_file.flush().await?;
        Ok(())
    }

    async fn download(
        &mut self,
        remote: &str,
        local: &str,
        resume_from: u64,
        on_progress: &(dyn Fn(u64) + Send + Sync),
        control: &(dyn TransferControl + Send + Sync),
    ) -> Result<()> {
        let sftp = self.sftp_ref()?;
        let mut remote_file = sftp.open(remote).await.map_err(map_sftp)?;
        if resume_from > 0 {
            use tokio::io::AsyncSeekExt;
            remote_file
                .seek(std::io::SeekFrom::Start(resume_from))
                .await?;
        }
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
        loop {
            if control.should_cancel() {
                return Err(YoinkError::Cancelled);
            }
            if control.should_pause() {
                local_file.sync_all().await?;
                return Err(YoinkError::Paused);
            }
            let n = remote_file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            local_file.write_all(&buf[..n]).await?;
            total += n as u64;
            on_progress(total);
        }
        local_file.sync_all().await?;
        Ok(())
    }
}
