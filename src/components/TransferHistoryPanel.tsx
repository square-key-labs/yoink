import * as Dialog from "@radix-ui/react-dialog";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api, type Transfer } from "../lib/api";
import { formatBytes } from "../lib/format";
import { X } from "./icons";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayBucketLabel(ts: number): string {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  const today = startOfDay(new Date());
  const bucket = startOfDay(d);
  const diffDays = Math.round(
    (today.getTime() - bucket.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// The Transfer type lacks a timestamp — group by id rank as best-effort;
// we'll place everything under "Today" in that case. If backend later adds
// a timestamp, this grouping will use it automatically via (t as any).created_at.
function transferTimestamp(t: Transfer): number {
  const anyT = t as unknown as { created_at?: number; updated_at?: number };
  if (typeof anyT.created_at === "number" && anyT.created_at > 0) {
    // Accept seconds or ms.
    return anyT.created_at > 1e12 ? anyT.created_at : anyT.created_at * 1000;
  }
  if (typeof anyT.updated_at === "number" && anyT.updated_at > 0) {
    return anyT.updated_at > 1e12 ? anyT.updated_at : anyT.updated_at * 1000;
  }
  return Date.now();
}

interface TransferHistoryPanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TransferHistoryPanel({
  open,
  onOpenChange,
}: TransferHistoryPanelProps) {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setCleared(false);

    const refresh = () => {
      api
        .transferList()
        .then((list) => alive && setRows(list))
        .catch(() => {});
    };

    refresh();
    const unlisten = listen<unknown>("yoink://transfer", () => {
      if (!alive) return;
      refresh();
    });

    return () => {
      alive = false;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [open]);

  const visible = cleared ? [] : rows;

  // Sort most-recent first and group by day.
  const sorted = [...visible].sort(
    (a, b) => transferTimestamp(b) - transferTimestamp(a),
  );
  const groups = new Map<string, Transfer[]>();
  for (const t of sorted) {
    const label = dayBucketLabel(transferTimestamp(t));
    const arr = groups.get(label) ?? [];
    arr.push(t);
    groups.set(label, arr);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 w-[520px] max-w-[90vw] bg-white dark:bg-neutral-900 shadow-2xl border-l border-black/10 dark:border-white/10 flex flex-col outline-none">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <Dialog.Title className="text-sm font-semibold">
              Transfer history
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCleared(true)}
                disabled={visible.length === 0}
                className="text-[11px] rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 disabled:opacity-50"
              >
                Clear all
              </button>
              <Dialog.Close
                aria-label="Close"
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>

          <Dialog.Description className="sr-only">
            Past transfer history
          </Dialog.Description>

          <div className="flex-1 min-h-0 overflow-auto">
            {groups.size === 0 ? (
              <div className="px-4 py-6 text-[12px] text-secondary">
                No past transfers.
              </div>
            ) : (
              Array.from(groups.entries()).map(([label, items]) => (
                <div key={label}>
                  <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] uppercase tracking-wider text-secondary bg-white/90 dark:bg-neutral-900/90 backdrop-blur border-b border-hairline">
                    {label} · {items.length}
                  </div>
                  {items.map((t) => (
                    <HistoryRow key={t.id} t={t} />
                  ))}
                </div>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HistoryRow({ t }: { t: Transfer }) {
  const arrow = t.direction === "upload" ? "↑" : "↓";
  const stateClass =
    t.state === "failed"
      ? "text-red-600 dark:text-red-400"
      : t.state === "done"
        ? "text-emerald-600 dark:text-emerald-400"
        : t.state === "cancelled"
          ? "text-neutral-500"
          : t.state === "paused"
            ? "text-amber-600 dark:text-amber-400"
            : "text-secondary";
  return (
    <div className="px-4 py-2 border-b border-hairline text-xs">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {arrow} {t.remote_path}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-secondary">
            {t.local_path}
          </div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className={"text-[11px] uppercase tracking-wider " + stateClass}>
            {t.state}
          </div>
          <div className="text-[11px] text-secondary">
            {formatBytes(t.bytes_done)} / {formatBytes(t.total_bytes)}
          </div>
        </div>
      </div>
      {t.error && (
        <div className="mt-1 text-[11px] text-red-600 dark:text-red-400 break-words">
          {t.error}
        </div>
      )}
    </div>
  );
}

export function TransferHistoryMount() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onToggle() {
      setOpen((v) => !v);
    }
    window.addEventListener(
      "yoink:toggle-transfer-history",
      onToggle as EventListener,
    );
    return () =>
      window.removeEventListener(
        "yoink:toggle-transfer-history",
        onToggle as EventListener,
      );
  }, []);
  return <TransferHistoryPanel open={open} onOpenChange={setOpen} />;
}

export default TransferHistoryPanel;
