use crate::error::{Result, YoinkError};
use crate::protocols::ProtocolKind;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const SERVICE: &str = "com.squarekeylabs.yoink";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase", tag = "kind")]
pub enum AuthRef {
    Password,
    Key { private_key_ref: String, has_passphrase: bool },
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub label: String,
    pub kind: ProtocolKind,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_ref: AuthRef,
    #[serde(default)]
    pub initial_path: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct BookmarksFile {
    pub version: u32,
    pub bookmarks: Vec<Bookmark>,
}

pub struct BookmarkStore {
    path: PathBuf,
}

impl BookmarkStore {
    pub fn default_path() -> Result<PathBuf> {
        let mut p = dirs::data_dir()
            .ok_or_else(|| YoinkError::Other("no data dir".into()))?;
        p.push("Yoink");
        p.push("bookmarks.json");
        Ok(p)
    }

    pub fn new(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        Ok(Self { path })
    }

    pub fn load(&self) -> Result<BookmarksFile> {
        if !self.path.exists() {
            return Ok(BookmarksFile { version: 1, bookmarks: vec![] });
        }
        let text = fs::read_to_string(&self.path)?;
        let file: BookmarksFile = serde_json::from_str(&text)
            .map_err(|e| YoinkError::Other(format!("bookmarks parse: {e}")))?;
        Ok(file)
    }

    pub fn save(&self, file: &BookmarksFile) -> Result<()> {
        let text = serde_json::to_string_pretty(file)
            .map_err(|e| YoinkError::Other(format!("bookmarks serialize: {e}")))?;
        fs::write(&self.path, text)?;
        Ok(())
    }
}

pub struct KeychainClient;

impl KeychainClient {
    fn entry(bookmark_id: &str, slot: &str) -> Result<Entry> {
        let user = format!("{bookmark_id}:{slot}");
        Entry::new(SERVICE, &user).map_err(|e| YoinkError::Keychain(e.to_string()))
    }

    pub fn set_password(bookmark_id: &str, password: &str) -> Result<()> {
        let entry = Self::entry(bookmark_id, "password")?;
        entry
            .set_password(password)
            .map_err(|e| YoinkError::Keychain(e.to_string()))
    }

    pub fn get_password(bookmark_id: &str) -> Result<String> {
        let entry = Self::entry(bookmark_id, "password")?;
        entry
            .get_password()
            .map_err(|e| YoinkError::Keychain(e.to_string()))
    }

    pub fn delete(bookmark_id: &str, slot: &str) -> Result<()> {
        let entry = Self::entry(bookmark_id, slot)?;
        entry
            .delete_credential()
            .map_err(|e| YoinkError::Keychain(e.to_string()))
    }
}
