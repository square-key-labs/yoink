import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect } from "react";
import type { Transfer } from "../lib/api";

function basename(p: string | undefined | null): string {
  if (!p) return "";
  const norm = p.replace(/\\+/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : norm;
}

function pickName(t: Partial<Transfer> | undefined | null): string {
  if (!t) return "transfer";
  const fromRemote = basename(t.remote_path ?? undefined);
  const fromLocal = basename(t.local_path ?? undefined);
  if (t.direction === "upload") {
    return fromLocal || fromRemote || "transfer";
  }
  if (t.direction === "download") {
    return fromRemote || fromLocal || "transfer";
  }
  return fromRemote || fromLocal || "transfer";
}

async function ensurePermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const res = await requestPermission();
      granted = res === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

export function useTransferNotifications() {
  useEffect(() => {
    let alive = true;
    // Track which transfer IDs we've already notified for, so we don't fire
    // repeated notifications for sticky "done"/"failed" states.
    const notified = new Set<string>();

    const unlistenP = listen<any>("yoink://transfer", async (evt) => {
      if (!alive) return;
      const payload = evt.payload as Partial<Transfer> | undefined;
      if (!payload || typeof payload !== "object") return;

      const { id, state } = payload;
      if (!id || (state !== "done" && state !== "failed")) return;
      if (notified.has(id)) return;
      notified.add(id);

      const ok = await ensurePermission();
      if (!ok) return;

      const name = pickName(payload);
      const direction = payload.direction;
      const verb =
        direction === "upload"
          ? "Upload"
          : direction === "download"
            ? "Download"
            : "Transfer";

      if (state === "done") {
        sendNotification({
          title: `${verb} complete`,
          body: name,
        });
      } else {
        const err =
          typeof payload.error === "string" && payload.error.trim().length > 0
            ? payload.error
            : "Transfer failed";
        sendNotification({
          title: `${verb} failed: ${name}`,
          body: err,
        });
      }
    });

    return () => {
      alive = false;
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, []);
}

export function TransferNotificationsMount() {
  useTransferNotifications();
  return null;
}

export default TransferNotificationsMount;
