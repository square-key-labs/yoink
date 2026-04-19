import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { api, type Transfer, type TransferState } from "../lib/api";
import { formatBytes } from "../lib/format";
import { X } from "./icons";

function formatEta(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

const DISMISS_AFTER_MS = 3500;

export function TransferQueuePanel() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, number>>(new Map());
  const [rates, setRates] = useState<Record<string, { bps: number; eta: number }>>(
    {},
  );
  const prevSample = useRef<Map<string, { ts: number; bytes: number }>>(new Map());

  useEffect(() => {
    let alive = true;
    api
      .transferList()
      .then((list) => alive && setRows(list))
      .catch(() => {});
    const unlisten = listen<any>("yoink://transfer", () => {
      if (!alive) return;
      // Re-fetch authoritative list on any event.
      api
        .transferList()
        .then((list) => alive && setRows(list))
        .catch(() => {});
    });
    return () => {
      alive = false;
      unlisten.then((fn) => fn());
      for (const id of timers.current.keys()) {
        const h = timers.current.get(id);
        if (h) clearTimeout(h);
      }
      timers.current.clear();
    };
  }, []);

  // Compute rolling speed + ETA for running transfers.
  useEffect(() => {
    const now = performance.now();
    const next: Record<string, { bps: number; eta: number }> = { ...rates };
    for (const t of rows) {
      if (t.state !== "running") {
        prevSample.current.delete(t.id);
        continue;
      }
      const prev = prevSample.current.get(t.id);
      if (prev) {
        const dt = (now - prev.ts) / 1000;
        const db = t.bytes_done - prev.bytes;
        if (dt > 0 && db >= 0) {
          const instant = db / dt;
          // Exponential smoothing
          const prevBps = rates[t.id]?.bps ?? instant;
          const bps = prevBps * 0.6 + instant * 0.4;
          const remaining = Math.max(0, t.total_bytes - t.bytes_done);
          const eta = bps > 0 ? remaining / bps : Infinity;
          next[t.id] = { bps, eta };
        }
      }
      prevSample.current.set(t.id, { ts: now, bytes: t.bytes_done });
    }
    setRates(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Schedule fade-out of terminal-state transfers after a short dwell.
  useEffect(() => {
    const terminal: TransferState[] = ["done", "failed", "cancelled"];
    for (const t of rows) {
      if (!terminal.includes(t.state)) continue;
      if (hidden.has(t.id)) continue;
      if (timers.current.has(t.id)) continue;
      const h = window.setTimeout(() => {
        setHidden((s) => new Set(s).add(t.id));
      }, DISMISS_AFTER_MS);
      timers.current.set(t.id, h);
    }
  }, [rows, hidden]);

  const visible = rows.filter((r) => !hidden.has(r.id));

  if (visible.length === 0) {
    return (
      <div className="h-10 shrink-0 border-t border-hairline px-3 flex items-center text-[11px] text-secondary surface-2">
        No transfers. Drag a file into a pane or use the menu to queue one.
      </div>
    );
  }

  async function clearAll() {
    const terminal: TransferState[] = ["done", "failed", "cancelled"];
    const next = new Set(hidden);
    for (const r of rows) if (terminal.includes(r.state)) next.add(r.id);
    setHidden(next);
  }

  async function cancel(id: string) {
    await api.transferCancel(id).catch(() => {});
  }
  async function pause(id: string) {
    await api.transferPause(id).catch(() => {});
  }
  async function resume(id: string) {
    await api.transferResume(id).catch(() => {});
  }
  async function retry(id: string) {
    await api.transferRetry(id).catch(() => {});
  }
  function dismiss(id: string) {
    setHidden((s) => new Set(s).add(id));
  }

  return (
    <div className="max-h-40 shrink-0 overflow-auto border-t border-hairline surface-1">
      <div className="px-3 h-7 flex items-center justify-between text-[10px] uppercase tracking-wider text-secondary border-b border-hairline">
        <span>Transfers · {visible.length}</span>
        <button onClick={clearAll} className="hover-soft rounded px-2 py-0.5">
          Clear completed
        </button>
      </div>
      {visible.map((t) => {
        const pct = t.total_bytes
          ? Math.min(100, Math.floor((t.bytes_done / t.total_bytes) * 100))
          : 0;
        const terminal =
          t.state === "done" ||
          t.state === "failed" ||
          t.state === "cancelled";
        return (
          <div
            key={t.id}
            className="px-3 py-1.5 text-xs border-b border-hairline"
          >
            <div className="flex justify-between items-center mb-1 gap-2">
              <span className="truncate flex-1">
                {t.direction === "upload" ? "↑" : "↓"} {t.remote_path}
              </span>
              <span className="tabular-nums text-secondary shrink-0">
                {formatBytes(t.bytes_done)} / {formatBytes(t.total_bytes)}
                {t.state === "running" && rates[t.id]?.bps
                  ? ` · ${formatBytes(rates[t.id].bps)}/s · ETA ${formatEta(rates[t.id].eta)}`
                  : ` · ${t.state}`}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {t.state === "running" && (
                  <button
                    onClick={() => pause(t.id)}
                    title="Pause"
                    className="hover-soft rounded p-1 text-[10px]"
                  >
                    Pause
                  </button>
                )}
                {t.state === "paused" && (
                  <button
                    onClick={() => resume(t.id)}
                    title="Resume"
                    className="hover-soft rounded p-1 text-[10px]"
                  >
                    Resume
                  </button>
                )}
                {t.state === "failed" && (
                  <button
                    onClick={() => retry(t.id)}
                    title="Retry"
                    className="hover-soft rounded p-1 text-[10px]"
                  >
                    Retry
                  </button>
                )}
                {!terminal && (
                  <button
                    onClick={() => cancel(t.id)}
                    title="Cancel"
                    className="hover-soft rounded p-1 text-[10px]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => dismiss(t.id)}
                  title="Dismiss"
                  className="hover-soft rounded p-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="h-1 rounded bg-black/5 dark:bg-white/5 overflow-hidden">
              <div
                className={
                  "h-full transition-all " +
                  (t.state === "failed"
                    ? "bg-red-500"
                    : t.state === "done"
                      ? "bg-emerald-500"
                      : t.state === "cancelled"
                        ? "bg-neutral-400"
                        : t.state === "paused"
                          ? "bg-amber-500"
                          : "bg-[rgb(var(--accent))]")
                }
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
