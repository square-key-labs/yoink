import * as Dialog from "@radix-ui/react-dialog";
import type { FileEntry } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useSessions } from "../store/sessions";
import { X } from "./icons";

function permsRwx(mode: number | null): string {
  if (mode == null) return "—";
  const bits = mode & 0o777;
  const triad = (v: number) =>
    `${v & 4 ? "r" : "-"}${v & 2 ? "w" : "-"}${v & 1 ? "x" : "-"}`;
  return triad((bits >> 6) & 7) + triad((bits >> 3) & 7) + triad(bits & 7);
}

function permsOctal(mode: number | null): string {
  if (mode == null) return "—";
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

function formatAbsolute(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function formatRelative(ts: number | null): string {
  if (!ts) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [86400 * 7, "day"],
    [86400 * 30, "day"],
    [86400 * 365, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  for (let i = 0; i < units.length; i++) {
    const [threshold, unit] = units[i];
    if (abs < threshold) {
      const prev = i === 0 ? 1 : units[i - 1][0];
      const value = Math.round(-diff / prev);
      return rtf.format(value, unit);
    }
  }
  return "";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-xs">
      <div className="w-[110px] shrink-0 text-secondary">{label}</div>
      <div className="flex-1 min-w-0 break-all font-mono tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function FileInfoDialog() {
  const infoEntry = useSessions((s) => s.infoEntry);
  const setInfoEntry = useSessions((s) => s.setInfoEntry);
  const open = !!infoEntry;

  function onOpenChange(v: boolean) {
    if (!v) setInfoEntry(null);
  }

  const entry: FileEntry | null = infoEntry?.entry ?? null;
  const pane = infoEntry?.pane;

  const symlinkTarget =
    entry && entry.kind === "symlink"
      ? (entry as FileEntry & { target?: string }).target ?? null
      : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[92vw] rounded-lg surface-1 border border-hairline shadow-xl p-4 focus:outline-none">
          <div className="flex items-start justify-between mb-3">
            <Dialog.Title className="text-sm font-semibold truncate pr-2">
              {entry ? entry.name : "File info"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded p-1 hover-soft shrink-0"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Dialog.Close>
          </div>
          {entry && (
            <div className="flex flex-col gap-1.5">
              <Row label="Name" value={entry.name} />
              <Row label="Path" value={entry.path} />
              <Row
                label="Kind"
                value={
                  <span>
                    {entry.kind}
                    {pane ? (
                      <span className="text-secondary"> · {pane}</span>
                    ) : null}
                  </span>
                }
              />
              <Row
                label="Size"
                value={
                  entry.kind === "dir"
                    ? "—"
                    : `${formatBytes(entry.size)} (${entry.size.toLocaleString()} bytes)`
                }
              />
              <Row
                label="Modified"
                value={
                  <span>
                    {formatAbsolute(entry.modified_unix)}
                    {entry.modified_unix ? (
                      <span className="text-secondary">
                        {" · "}
                        {formatRelative(entry.modified_unix)}
                      </span>
                    ) : null}
                  </span>
                }
              />
              <Row
                label="Permissions"
                value={
                  <span>
                    {permsOctal(entry.permissions)}{" "}
                    <span className="text-secondary">
                      ({permsRwx(entry.permissions)})
                    </span>
                  </span>
                }
              />
              {symlinkTarget ? (
                <Row label="Symlink →" value={symlinkTarget} />
              ) : null}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
