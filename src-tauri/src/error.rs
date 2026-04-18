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
    #[error("unknown host — fingerprint confirmation required")]
    UnknownHost { fingerprint: String },
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
    #[error("{0}")]
    Other(String),
}

impl Serialize for YoinkError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, YoinkError>;
