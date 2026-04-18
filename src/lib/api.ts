import { invoke } from "@tauri-apps/api/core";

export type ProtocolKind = "sftp" | "ftp" | "ftps";

export type Auth =
  | { kind: "password"; password: string }
  | { kind: "key"; private_key: string; passphrase?: string }
  | { kind: "agent" };

export interface ConnectionConfig {
  kind: ProtocolKind;
  host: string;
  port: number;
  username: string;
  auth: Auth;
  passive?: boolean;
  verify_host?: boolean;
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

export const api = {
  connect: (config: ConnectionConfig) =>
    invoke<string>("connect", { config }),
  disconnect: (sessionId: string) =>
    invoke<void>("disconnect", { sessionId }),
  listDir: (sessionId: string, path: string) =>
    invoke<FileEntry[]>("list_dir", { sessionId, path }),
  listSessions: () => invoke<string[]>("list_sessions"),
  bookmarksLoad: () => invoke<unknown>("bookmarks_load"),
  bookmarksSave: (file: unknown) => invoke<void>("bookmarks_save", { file }),
  keychainSetPassword: (bookmarkId: string, password: string) =>
    invoke<void>("keychain_set_password", { bookmarkId, password }),
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
  getTheme: () => invoke<"dark" | "light" | "system">("get_theme"),
};
