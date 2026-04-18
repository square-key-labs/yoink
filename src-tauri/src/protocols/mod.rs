pub mod ftp;
pub mod sftp;
pub mod traits;

pub use traits::{
    Auth, ConnectionConfig, EntryKind, FileEntry, Protocol, ProtocolKind, TransferProgress,
};
