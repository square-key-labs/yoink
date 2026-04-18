import { useEffect, useState } from "react";
import { api, type Transfer } from "../lib/api";
import { formatBytes } from "../lib/format";

export function TransferQueuePanel() {
  const [rows, setRows] = useState<Transfer[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const list = await api.transferList();
        if (alive) setRows(list);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (rows.length === 0) {
    return (
      <div className="h-10 shrink-0 border-t border-black/5 dark:border-white/5 px-3 flex items-center text-[11px] text-neutral-500 bg-white/40 dark:bg-neutral-900/40">
        No transfers. Drag a file into a pane or use the menu to queue one.
      </div>
    );
  }

  return (
    <div className="max-h-40 shrink-0 overflow-auto border-t border-black/10 dark:border-white/10 bg-white/60 dark:bg-neutral-900/60">
      <div className="px-3 h-7 flex items-center text-[10px] uppercase tracking-wider text-neutral-500 border-b border-black/5 dark:border-white/5">
        Transfers · {rows.length}
      </div>
      {rows.map((t) => {
        const pct = t.total_bytes
          ? Math.min(100, Math.floor((t.bytes_done / t.total_bytes) * 100))
          : 0;
        return (
          <div
            key={t.id}
            className="px-3 py-1.5 text-xs border-b border-black/5 dark:border-white/5"
          >
            <div className="flex justify-between mb-1">
              <span className="truncate max-w-[60%]">
                {t.direction === "upload" ? "↑" : "↓"} {t.remote_path}
              </span>
              <span className="tabular-nums text-neutral-500">
                {formatBytes(t.bytes_done)} / {formatBytes(t.total_bytes)} · {t.state}
              </span>
            </div>
            <div className="h-1 rounded bg-black/5 dark:bg-white/5 overflow-hidden">
              <div
                className={
                  "h-full " +
                  (t.state === "failed"
                    ? "bg-red-500"
                    : t.state === "done"
                      ? "bg-emerald-500"
                      : "bg-sky-500")
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
