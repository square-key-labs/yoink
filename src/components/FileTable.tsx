import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { FileEntry } from "../lib/api";
import { formatBytes, formatPerms, formatUnix } from "../lib/format";
import { FileIcon, Folder } from "./icons";

export function FileTable({
  entries,
  onOpen,
  loading,
  emptyLabel = "Empty directory",
}: {
  entries: FileEntry[];
  onOpen: (entry: FileEntry) => void;
  loading: boolean;
  emptyLabel?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = [...entries].sort((a, b) => {
    if (a.kind === "dir" && b.kind !== "dir") return -1;
    if (a.kind !== "dir" && b.kind === "dir") return 1;
    return a.name.localeCompare(b.name);
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_80px_140px_60px] px-3 h-7 items-center text-[11px] font-medium text-neutral-500 border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40">
        <span>Name</span>
        <span className="text-right">Size</span>
        <span>Modified</span>
        <span className="text-right">Perms</span>
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto">
        {loading && (
          <div className="p-6 text-center text-xs text-neutral-500">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="p-6 text-center text-xs text-neutral-500">{emptyLabel}</div>
        )}
        {!loading && rows.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virt) => {
              const entry = rows[virt.index];
              return (
                <div
                  key={entry.path}
                  onDoubleClick={() => onOpen(entry)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virt.start}px)`,
                    height: `${virt.size}px`,
                  }}
                  className="grid grid-cols-[minmax(0,1fr)_80px_140px_60px] px-3 items-center text-xs hover:bg-black/5 dark:hover:bg-white/5 cursor-default"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {entry.kind === "dir" ? (
                      <Folder className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    ) : (
                      <FileIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="text-right tabular-nums text-neutral-500">
                    {entry.kind === "dir" ? "—" : formatBytes(entry.size)}
                  </span>
                  <span className="text-neutral-500 tabular-nums truncate">
                    {formatUnix(entry.modified_unix)}
                  </span>
                  <span className="text-right tabular-nums text-neutral-500">
                    {formatPerms(entry.permissions)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
