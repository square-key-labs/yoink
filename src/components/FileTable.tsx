import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileEntry } from "../lib/api";
import { formatBytes, formatPerms, formatUnix } from "../lib/format";
import { useDragState } from "../store/dragState";
import { useViewPrefs, type SortKey } from "../store/viewPrefs";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  FileIcon,
  Folder,
} from "./icons";

export interface RowSelectMeta {
  additive: boolean;
  range: boolean;
}

interface HeaderCellProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: "asc" | "desc";
  onClick: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}

function HeaderCell({
  label,
  sortKey,
  activeKey,
  activeDir,
  onClick,
  className = "",
  align = "left",
}: HeaderCellProps) {
  const active = sortKey === activeKey;
  const justify = align === "right" ? "justify-end" : "justify-start";
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={
        "flex items-center gap-1 text-[11px] font-medium text-secondary hover:text-primary transition-colors select-none " +
        justify +
        " " +
        className
      }
    >
      <span className="truncate">{label}</span>
      {active ? (
        activeDir === "asc" ? (
          <ChevronUp className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
      )}
    </button>
  );
}

export function FileTable({
  entries,
  onOpen,
  onContextMenu,
  loading,
  emptyLabel = "Empty directory",
  selected,
  onRowClick,
  onDragStartRow,
  paneKind,
  onDropFiles,
  droppable,
  onHoverChange,
}: {
  entries: FileEntry[];
  onOpen: (entry: FileEntry) => void;
  onContextMenu?: (entry: FileEntry) => void;
  loading: boolean;
  emptyLabel?: string;
  selected?: Set<string>;
  onRowClick?: (entry: FileEntry, meta: RowSelectMeta) => void;
  onDragStartRow?: (entry: FileEntry) => FileEntry[];
  paneKind: "local" | "remote";
  onDropFiles?: (entries: FileEntry[], fromPane: "local" | "remote") => void;
  droppable?: boolean;
  onHoverChange?: (hovering: boolean, paths: FileEntry[] | null) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);

  const sortKey = useViewPrefs((s) => s.sortKey);
  const sortDir = useViewPrefs((s) => s.sortDir);
  const setSort = useViewPrefs((s) => s.setSort);

  useEffect(() => {
    // Safety net: clear hover/drop UI when any drag ends or focus leaves,
    // in case a drop landed outside the pane container.
    const reset = () => {
      setDropActive(false);
      onHoverChange?.(false, null);
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset, true);
    window.addEventListener("mouseup", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("mouseup", reset);
      window.removeEventListener("blur", reset);
    };
  }, [onHoverChange]);

  const rows = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    const cmp = (a: FileEntry, b: FileEntry): number => {
      // Dirs always stay above files, regardless of sort key.
      if (a.kind === "dir" && b.kind !== "dir") return -1;
      if (a.kind !== "dir" && b.kind === "dir") return 1;

      switch (sortKey) {
        case "size": {
          const av = a.kind === "dir" ? -1 : a.size;
          const bv = b.kind === "dir" ? -1 : b.size;
          if (av !== bv) return (av - bv) * mult;
          return a.name.localeCompare(b.name);
        }
        case "modified": {
          const av = a.modified_unix ?? -1;
          const bv = b.modified_unix ?? -1;
          if (av !== bv) return (av - bv) * mult;
          return a.name.localeCompare(b.name);
        }
        case "perms": {
          const av = a.permissions ?? -1;
          const bv = b.permissions ?? -1;
          if (av !== bv) return (av - bv) * mult;
          return a.name.localeCompare(b.name);
        }
        case "name":
        default:
          return a.name.localeCompare(b.name) * mult;
      }
    };
    return [...entries].sort(cmp);
  }, [entries, sortKey, sortDir]);

  // Clamp anchor if rows shrink.
  useEffect(() => {
    if (anchorIdx === null) return;
    if (anchorIdx >= rows.length) {
      setAnchorIdx(rows.length > 0 ? rows.length - 1 : null);
    }
  }, [rows.length, anchorIdx]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  const handleHeaderClick = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSort(key, sortDir === "asc" ? "desc" : "asc");
      } else {
        setSort(key, "asc");
      }
    },
    [sortKey, sortDir, setSort],
  );

  function handleDragOver(e: React.DragEvent) {
    if (!droppable) return;
    if (!e.dataTransfer.types.includes("application/x-yoink-entries")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!droppable) return;
    if (!e.dataTransfer.types.includes("application/x-yoink-entries")) return;
    setDropActive(true);
    try {
      const raw = e.dataTransfer.getData("application/x-yoink-entries");
      if (raw) {
        const parsed = JSON.parse(raw) as { entries: FileEntry[] };
        onHoverChange?.(true, parsed.entries);
        return;
      }
    } catch {}
    onHoverChange?.(true, null);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!droppable) return;
    // only clear when leaving the container, not child hops
    if (e.currentTarget === e.target) {
      setDropActive(false);
      onHoverChange?.(false, null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    setDropActive(false);
    onHoverChange?.(false, null);
    if (!droppable || !onDropFiles) return;
    const raw = e.dataTransfer.getData("application/x-yoink-entries");
    if (!raw) return;
    e.preventDefault();
    try {
      const parsed = JSON.parse(raw) as {
        fromPane: "local" | "remote";
        entries: FileEntry[];
      };
      if (parsed.fromPane === paneKind) return;
      onDropFiles(parsed.entries, parsed.fromPane);
    } catch {}
  }

  const moveTo = useCallback(
    (nextIdx: number, extend: boolean) => {
      if (rows.length === 0) return;
      const clamped = Math.max(0, Math.min(rows.length - 1, nextIdx));
      const entry = rows[clamped];
      if (!entry) return;
      onRowClick?.(entry, { additive: false, range: extend });
      setAnchorIdx(clamped);
      virtualizer.scrollToIndex(clamped, { align: "auto" });
    },
    [rows, onRowClick, virtualizer],
  );

  const currentIdx = useMemo(() => {
    if (anchorIdx !== null && anchorIdx < rows.length) return anchorIdx;
    if (!selected || selected.size === 0) return null;
    // Fall back to the last selected row's index in `rows`.
    for (let i = rows.length - 1; i >= 0; i--) {
      if (selected.has(rows[i].path)) return i;
    }
    return null;
  }, [anchorIdx, selected, rows]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (rows.length === 0) return;
    const key = e.key;
    const extend = e.shiftKey;
    const base = currentIdx ?? 0;

    switch (key) {
      case "ArrowDown":
        e.preventDefault();
        moveTo(currentIdx === null ? 0 : base + 1, extend);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveTo(currentIdx === null ? 0 : base - 1, extend);
        break;
      case "Home":
        e.preventDefault();
        moveTo(0, extend);
        break;
      case "End":
        e.preventDefault();
        moveTo(rows.length - 1, extend);
        break;
      case "PageDown":
        e.preventDefault();
        moveTo(currentIdx === null ? 0 : base + 10, extend);
        break;
      case "PageUp":
        e.preventDefault();
        moveTo(currentIdx === null ? 0 : base - 10, extend);
        break;
      case "Enter": {
        if (currentIdx === null) return;
        e.preventDefault();
        const entry = rows[currentIdx];
        if (entry) onOpen(entry);
        break;
      }
      default:
        break;
    }
  }

  return (
    <div
      className={
        "flex-1 min-h-0 flex flex-col transition-colors relative " +
        (dropActive
          ? "ring-2 ring-[rgb(var(--accent))]/70 ring-inset bg-accent-soft"
          : "")
      }
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex px-3 h-7 items-center gap-3 text-[11px] font-medium text-secondary border-b border-hairline surface-2">
        <HeaderCell
          label="Name"
          sortKey="name"
          activeKey={sortKey}
          activeDir={sortDir}
          onClick={handleHeaderClick}
          className="min-w-[160px] flex-1 basis-0 shrink-0"
          align="left"
        />
        <HeaderCell
          label="Size"
          sortKey="size"
          activeKey={sortKey}
          activeDir={sortDir}
          onClick={handleHeaderClick}
          className="w-[80px] shrink-0"
          align="right"
        />
        <HeaderCell
          label="Modified"
          sortKey="modified"
          activeKey={sortKey}
          activeDir={sortDir}
          onClick={handleHeaderClick}
          className="w-[140px] min-w-0 shrink overflow-hidden"
          align="left"
        />
        <HeaderCell
          label="Perms"
          sortKey="perms"
          activeKey={sortKey}
          activeDir={sortDir}
          onClick={handleHeaderClick}
          className="w-[56px] shrink-0"
          align="right"
        />
      </div>
      {loading && (
        <div className="absolute left-0 right-0 top-0 h-0.5 overflow-hidden z-10">
          <div className="h-full w-1/3 bg-[rgb(var(--accent))] animate-[slide_1.1s_ease-in-out_infinite]" />
        </div>
      )}
      <div
        ref={parentRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-auto relative outline-none focus:bg-[rgb(var(--surface-2))]/40"
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="apple-spinner" aria-label="Loading">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${-1.1 + i * 0.1}s` }} />
              ))}
            </div>
            <div className="text-xs text-secondary tracking-wide">Loading…</div>
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="p-6 text-center text-xs text-secondary">
            {emptyLabel}
          </div>
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
              const isSelected = selected?.has(entry.path) ?? false;
              return (
                <div
                  key={entry.path}
                  draggable={!!onDragStartRow}
                  onClick={(e) => {
                    onRowClick?.(entry, {
                      additive: e.metaKey || e.ctrlKey,
                      range: e.shiftKey,
                    });
                    setAnchorIdx(virt.index);
                  }}
                  onDoubleClick={() => onOpen(entry)}
                  onContextMenu={(e) => {
                    if (!onContextMenu) return;
                    e.preventDefault();
                    onContextMenu(entry);
                  }}
                  onDragStart={(e) => {
                    if (!onDragStartRow) return;
                    const payload = onDragStartRow(entry);
                    e.dataTransfer.setData(
                      "application/x-yoink-entries",
                      JSON.stringify({ fromPane: paneKind, entries: payload }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                    useDragState.getState().setIntraActive(true);
                  }}
                  onDragEnd={() => {
                    useDragState.getState().setIntraActive(false);
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virt.start}px)`,
                    height: `${virt.size}px`,
                  }}
                  className={
                    "flex px-3 items-center gap-3 text-xs cursor-pointer " +
                    (isSelected ? "bg-accent-soft" : "hover-soft")
                  }
                >
                  <span className="flex items-center gap-2 min-w-[160px] flex-1 basis-0 shrink-0">
                    {entry.kind === "dir" ? (
                      <Folder className="h-3.5 w-3.5 text-[rgb(var(--accent))] shrink-0" />
                    ) : (
                      <FileIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="w-[80px] text-right tabular-nums text-secondary shrink-0">
                    {entry.kind === "dir" ? "—" : formatBytes(entry.size)}
                  </span>
                  <span className="w-[140px] min-w-0 shrink overflow-hidden text-secondary tabular-nums truncate">
                    {formatUnix(entry.modified_unix)}
                  </span>
                  <span className="w-[56px] text-right tabular-nums text-secondary shrink-0">
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

