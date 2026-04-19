//! TCP proxy helpers used by protocol connectors.
//!
//! Supports SOCKS5 (via `tokio-socks`) and HTTP CONNECT tunnels. The returned
//! `TcpStream` is directly usable with `russh::client::connect_stream` or
//! `suppaftp::AsyncFtpStream::connect_with_stream`.

use crate::error::{Result, YoinkError};
use crate::protocols::traits::{ProxyConfig, ProxyKind};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio_socks::tcp::Socks5Stream;

/// Dial `target_host:target_port` through the given proxy and return the
/// underlying `TcpStream` with the tunnel established.
pub async fn connect_via_proxy(
    proxy: &ProxyConfig,
    target_host: &str,
    target_port: u16,
) -> Result<TcpStream> {
    match proxy.kind {
        ProxyKind::Socks5 => connect_socks5(proxy, target_host, target_port).await,
        ProxyKind::Http => connect_http(proxy, target_host, target_port).await,
    }
}

async fn connect_socks5(
    proxy: &ProxyConfig,
    target_host: &str,
    target_port: u16,
) -> Result<TcpStream> {
    let proxy_addr = format!("{}:{}", proxy.host, proxy.port);
    let target = (target_host, target_port);
    let stream = match (proxy.username.as_deref(), proxy.password.as_deref()) {
        (Some(u), Some(p)) if !u.is_empty() => {
            Socks5Stream::connect_with_password(proxy_addr.as_str(), target, u, p)
                .await
                .map_err(|e| YoinkError::Connection(format!("socks5: {e}")))?
        }
        _ => Socks5Stream::connect(proxy_addr.as_str(), target)
            .await
            .map_err(|e| YoinkError::Connection(format!("socks5: {e}")))?,
    };
    Ok(stream.into_inner())
}

async fn connect_http(
    proxy: &ProxyConfig,
    target_host: &str,
    target_port: u16,
) -> Result<TcpStream> {
    let proxy_addr = format!("{}:{}", proxy.host, proxy.port);
    let mut stream = TcpStream::connect(&proxy_addr)
        .await
        .map_err(|e| YoinkError::Connection(format!("http-proxy connect: {e}")))?;

    let host_hdr = format!("{target_host}:{target_port}");
    let mut req = format!(
        "CONNECT {host_hdr} HTTP/1.1\r\nHost: {host_hdr}\r\nProxy-Connection: keep-alive\r\n",
    );
    if let (Some(u), Some(p)) = (proxy.username.as_deref(), proxy.password.as_deref()) {
        if !u.is_empty() {
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            let creds = STANDARD.encode(format!("{u}:{p}"));
            req.push_str(&format!("Proxy-Authorization: Basic {creds}\r\n"));
        }
    }
    req.push_str("\r\n");

    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| YoinkError::Connection(format!("http-proxy write: {e}")))?;
    stream
        .flush()
        .await
        .map_err(|e| YoinkError::Connection(format!("http-proxy flush: {e}")))?;

    // Read status line and discard headers until CRLF CRLF.
    let mut reader = BufReader::new(stream);
    let mut status = String::new();
    reader
        .read_line(&mut status)
        .await
        .map_err(|e| YoinkError::Connection(format!("http-proxy read: {e}")))?;
    // Expected: "HTTP/1.1 200 Connection established\r\n"
    let mut parts = status.split_whitespace();
    let _version = parts.next();
    let code = parts.next().unwrap_or("");
    if !code.starts_with('2') {
        return Err(YoinkError::Connection(format!(
            "http-proxy refused CONNECT: {}",
            status.trim_end()
        )));
    }
    loop {
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| YoinkError::Connection(format!("http-proxy header: {e}")))?;
        if n == 0 || line == "\r\n" || line == "\n" {
            break;
        }
    }

    // BufReader may have pulled bytes past the CRLF CRLF. For CONNECT this is
    // rare in practice (servers respond then wait), but we still need to
    // recover any buffered bytes rather than silently dropping them.
    let buffered = reader.buffer().to_vec();
    let inner = reader.into_inner();
    if !buffered.is_empty() {
        return Err(YoinkError::Connection(
            "http-proxy sent data before tunnel handshake complete".into(),
        ));
    }
    Ok(inner)
}
