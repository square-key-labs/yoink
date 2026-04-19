use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum YoinkError {
    #[error("connection failed: {0}")]
    Connection(String),
    #[error("authentication failed")]
    Auth,
    #[error("host key mismatch — server fingerprint changed")]
    HostKeyMismatch,
    #[error("unknown host {host}:{port} — fingerprint confirmation required: {fingerprint}")]
    UnknownHost {
        fingerprint: String,
        host: String,
        port: u16,
    },
    #[error("not connected")]
    NotConnected,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("keychain error: {0}")]
    Keychain(String),
    #[error("cancelled")]
    Cancelled,
    #[error("paused")]
    Paused,
    #[error("{0}")]
    Other(String),
}

impl Serialize for YoinkError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        match self {
            YoinkError::UnknownHost {
                fingerprint,
                host,
                port,
            } => {
                let mut map = s.serialize_map(Some(5))?;
                map.serialize_entry("kind", "unknown_host")?;
                map.serialize_entry("message", &self.to_string())?;
                map.serialize_entry("fingerprint", fingerprint)?;
                map.serialize_entry("host", host)?;
                map.serialize_entry("port", port)?;
                map.end()
            }
            _ => s.serialize_str(&self.to_string()),
        }
    }
}

pub type Result<T> = std::result::Result<T, YoinkError>;
