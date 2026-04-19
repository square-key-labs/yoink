import { invoke } from "@tauri-apps/api/core";

export type ProtocolKind = "sftp" | "ftp" | "ftps";

export type Auth =
  | { kind: "password"; password: string }
  | { kind: "key"; private_key: string; passphrase?: string }
  | { kind: "agent" };

export type ProxyKind = "socks5" | "http";

export interface ProxyConfig {
  kind: ProxyKind;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ConnectionConfig {
  kind: ProtocolKind;
  host: string;
  port: number;
  username: string;
  auth: Auth;
  passive?: boolean;
  verify_host?: boolean;
  proxy?: ProxyConfig | null;
}

/**
 * Shape of the error payload thrown when `connect` hits an unknown host
 * fingerprint (TOFU). Call `api.acceptHostFingerprint` with these values once
 * the user confirms, then retry `connect`.
 */
export interface UnknownHostError {
  kind: "unknown_host";
  message: string;
  host: string;
  port: number;
  fingerprint: string;
}

export type EntryKind = "file" | "dir" | "symlink" | "other";

export interface FileEntry {
  name: string;
  path: string;
  kind: EntryKind;
  size: number;
  modified_unix: number | null;
  permissions: number | null;
}

export type TransferDirection = "upload" | "download";
export type TransferState =
  | "queued"
  | "running"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

export interface Transfer {
  id: string;
  session_id: string;
  direction: TransferDirection;
  local_path: string;
  remote_path: string;
  total_bytes: number;
  bytes_done: number;
  state: TransferState;
  error: string | null;
}

export type AuthRef =
  | { kind: "password" }
  | { kind: "key"; private_key_ref: string; has_passphrase: boolean }
  | { kind: "agent" };

export interface Bookmark {
  id: string;
  label: string;
  kind: ProtocolKind;
  host: string;
  port: number;
  username: string;
  auth_ref: AuthRef;
  initial_path?: string | null;
}

export interface BookmarksFile {
  version: number;
  bookmarks: Bookmark[];
}

export const api = {
  connect: (config: ConnectionConfig) =>
    invoke<string>("connect", { config }),
  disconnect: (sessionId: string) =>
    invoke<void>("disconnect", { sessionId }),
  listDir: (sessionId: string, path: string) =>
    invoke<FileEntry[]>("list_dir", { sessionId, path }),
  listSessions: () => invoke<string[]>("list_sessions"),
  remoteRename: (sessionId: string, from: string, to: string) =>
    invoke<void>("remote_rename", { sessionId, from, to }),
  remoteRemove: (sessionId: string, path: string) =>
    invoke<void>("remote_remove", { sessionId, path }),
  remoteMkdir: (sessionId: string, path: string) =>
    invoke<void>("remote_mkdir", { sessionId, path }),
  bookmarksLoad: () => invoke<BookmarksFile>("bookmarks_load"),
  bookmarksSave: (file: BookmarksFile) =>
    invoke<void>("bookmarks_save", { file }),
  keychainSetPassword: (bookmarkId: string, password: string) =>
    invoke<void>("keychain_set_password", { bookmarkId, password }),
  keychainGetPassword: (bookmarkId: string) =>
    invoke<string | null>("keychain_get_password", { bookmarkId }),
  keychainDelete: (bookmarkId: string, slot: string) =>
    invoke<void>("keychain_delete", { bookmarkId, slot }),
  transferEnqueue: (
    sessionId: string,
    direction: TransferDirection,
    localPath: string,
    remotePath: string,
    totalBytes: number,
  ) =>
    invoke<Transfer>("transfer_enqueue", {
      sessionId,
      direction,
      localPath,
      remotePath,
      totalBytes,
    }),
  transferList: () => invoke<Transfer[]>("transfer_list"),
  transferPause: (id: string) =>
    invoke<void>("transfer_pause", { id }),
  transferResume: (id: string) =>
    invoke<void>("transfer_resume", { id }),
  transferCancel: (id: string) =>
    invoke<void>("transfer_cancel", { id }),
  transferRetry: (id: string) =>
    invoke<void>("transfer_retry", { id }),
  getTheme: () => invoke<"dark" | "light" | "system">("get_theme"),
  acceptHostFingerprint: (host: string, port: number, fingerprint: string) =>
    invoke<void>("accept_host_fingerprint", { host, port, fingerprint }),
};
