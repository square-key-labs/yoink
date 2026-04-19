use crate::error::{Result, YoinkError};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

pub struct KnownHosts {
    path: PathBuf,
}

impl KnownHosts {
    pub fn default_path() -> Result<PathBuf> {
        let mut p = dirs::data_dir().ok_or_else(|| YoinkError::Other("no data dir".into()))?;
        p.push("Yoink");
        p.push("known_hosts");
        Ok(p)
    }

    pub fn new(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        Ok(Self { path })
    }

    pub fn lookup(&self, host: &str, port: u16) -> Result<Option<String>> {
        if !self.path.exists() {
            return Ok(None);
        }
        let contents = fs::read_to_string(&self.path)?;
        let key = format!("{host}:{port} ");
        for line in contents.lines() {
            if let Some(rest) = line.strip_prefix(&key) {
                return Ok(Some(rest.trim().to_string()));
            }
        }
        Ok(None)
    }

    pub fn insert(&self, host: &str, port: u16, fingerprint: &str) -> Result<()> {
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        writeln!(f, "{host}:{port} {fingerprint}")?;
        Ok(())
    }
}
