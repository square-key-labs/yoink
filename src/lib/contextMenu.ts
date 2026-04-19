import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ask } from "@tauri-apps/plugin-dialog";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { api, type FileEntry } from "./api";

export async function showRemoteContextMenu(opts: {
  entry: FileEntry;
  sessionId: string;
  cwd: string;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
  onGetInfo?: (entry: FileEntry) => void;
}) {
  const { entry, sessionId, cwd, onRefresh, onNavigate, onGetInfo } = opts;
  const items = await Promise.all([
    MenuItem.new({
      text: "Get Info",
      action: () => onGetInfo?.(entry),
    }),
    PredefinedMenuItem.new({ item: "Separator" }),
    MenuItem.new({
      text: entry.kind === "dir" ? "Open" : "Download to Downloads",
      action: async () => {
        if (entry.kind === "dir") {
          onNavigate(entry.path);
        } else {
          try {
            const home = await import("@tauri-apps/api/path").then((m) =>
              m.downloadDir(),
            );
            const dest = `${home.replace(/\/$/, "")}/${entry.name}`;
            await api.transferEnqueue(
              sessionId,
              "download",
              dest,
              entry.path,
              entry.size,
            );
          } catch (e) {
            console.error(e);
          }
        }
      },
    }),
    MenuItem.new({
      text: "Copy path",
      action: () => writeText(entry.path).catch(() => {}),
    }),
    PredefinedMenuItem.new({ item: "Separator" }),
    MenuItem.new({
      text: "Rename…",
      action: async () => {
        const next = prompt("New name:", entry.name);
        if (!next || next === entry.name) return;
        const dst = `${cwd.replace(/\/$/, "")}/${next}`;
        try {
          await api.remoteRename(sessionId, entry.path, dst);
          onRefresh();
        } catch (e) {
          alert(`Rename failed: ${e}`);
        }
      },
    }),
    MenuItem.new({
      text: "Delete",
      action: async () => {
        const label =
          entry.kind === "dir" ? "folder" : "file";
        const ok = await ask(
          `Delete the remote ${label} "${entry.name}" at ${entry.path}? This cannot be undone.`,
          {
            title: `Delete ${label}`,
            kind: "warning",
            okLabel: "Delete",
            cancelLabel: "Cancel",
          },
        );
        if (!ok) return;
        try {
          await api.remoteRemove(sessionId, entry.path);
          onRefresh();
        } catch (e) {
          alert(`Delete failed: ${e}`);
        }
      },
    }),
    PredefinedMenuItem.new({ item: "Separator" }),
    MenuItem.new({
      text: "New folder here…",
      action: async () => {
        const name = prompt("Folder name:");
        if (!name) return;
        const dst = `${cwd.replace(/\/$/, "")}/${name}`;
        try {
          await api.remoteMkdir(sessionId, dst);
          onRefresh();
        } catch (e) {
          alert(`Mkdir failed: ${e}`);
        }
      },
    }),
    MenuItem.new({
      text: "Refresh",
      action: () => onRefresh(),
    }),
  ]);

  const menu = await Menu.new({ items });
  await menu.popup();
}

export async function showLocalContextMenu(opts: {
  entry: FileEntry;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
  onGetInfo?: (entry: FileEntry) => void;
}) {
  const { entry, onRefresh, onNavigate, onGetInfo } = opts;
  const items = await Promise.all([
    MenuItem.new({
      text: "Get Info",
      action: () => onGetInfo?.(entry),
    }),
    PredefinedMenuItem.new({ item: "Separator" }),
    MenuItem.new({
      text: entry.kind === "dir" ? "Open" : "Reveal in Finder",
      action: () => {
        if (entry.kind === "dir") onNavigate(entry.path);
        else shellOpen(entry.path.replace(/\/[^/]+$/, "")).catch(() => {});
      },
    }),
    MenuItem.new({
      text: "Copy path",
      action: () => writeText(entry.path).catch(() => {}),
    }),
    PredefinedMenuItem.new({ item: "Separator" }),
    MenuItem.new({
      text: "Refresh",
      action: () => onRefresh(),
    }),
  ]);
  const menu = await Menu.new({ items });
  await menu.popup();
}
