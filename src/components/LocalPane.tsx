import { listen } from "@tauri-apps/api/event";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useEffect, useRef, useState } from "react";
import { api, type FileEntry } from "../lib/api";
import { showLocalContextMenu } from "../lib/contextMenu";
import { useSessions } from "../store/sessions";
import { useViewPrefs } from "../store/viewPrefs";
import { DropBanner } from "./DropBanner";
import { FileTable } from "./FileTable";
import { PathBar } from "./PathBar";

export function LocalPane() {
  const [path, setPath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [intraHover, setIntraHover] = useState<{
    entries: FileEntry[] | null;
  } | null>(null);
  const activeTab = useSessions((s) => s.tabs.find((t) => t.id === s.activeId));
  const showHidden = useViewPrefs((s) => s.showHidden);
  const visibleEntries = showHidden
    ? entries
    : entries.filter((e) => !e.name.startsWith("."));

  async function load(target: string) {
    setLoading(true);
    setSelected(new Set());
    try {
      const items = await readDir(target);
      const mapped: FileEntry[] = await Promise.all(
        items.map(async (e) => {
          const kind = e.isDirectory
            ? "dir"
            : e.isSymlink
              ? "symlink"
              : e.isFile
                ? "file"
                : "other";
          const full = `${target.replace(/\/$/, "")}/${e.name}`;
          let size = 0;
          let modified_unix: number | null = null;
          let permissions: number | null = null;
          try {
            const info = await stat(full);
            size = Number(info.size ?? 0);
            if (info.mtime) {
              modified_unix = Math.floor(new Date(info.mtime).getTime() / 1000);
            }
            if (info.mode != null) {
              permissions = info.mode & 0o7777;
            }
          } catch {}
          return {
            name: e.name,
            path: full,
            kind,
            size,
            modified_unix,
            permissions,
          } as FileEntry;
        }),
      );
      setEntries(mapped);
      setPath(target);
    } catch (e: any) {
      setEntries([]);
      setPath(target);
      const { toast } = await import("../lib/toast");
      toast.error(`Can't read ${target}`, {
        detail: typeof e === "string" ? e : e?.message ?? String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    homeDir().then(load).catch(() => setLoading(false));
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const unlisten = listen<any>("yoink://transfer", (evt) => {
      try {
        if (evt.payload?.state === "done" && path) {
          loadRef.current(path);
        }
      } catch {}
    });
    return () => {
      unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  function onOpen(entry: FileEntry) {
    if (entry.kind === "dir") load(entry.path);
  }

  function onUp() {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return;
    parts.pop();
    const next = "/" + parts.join("/");
    load(next === "" ? "/" : next);
  }

  function onRowClick(entry: FileEntry, { additive }: { additive: boolean }) {
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (additive && next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  }

  async function onDropFiles(remoteEntries: FileEntry[], fromPane: "local" | "remote") {
    if (fromPane !== "remote" || !activeTab) return;
    for (const e of remoteEntries) {
      if (e.kind === "dir") continue;
      const localDest = `${path.replace(/\/$/, "")}/${e.name}`;
      try {
        await api.transferEnqueue(
          activeTab.sessionId,
          "download",
          localDest,
          e.path,
          e.size,
        );
      } catch {}
    }
  }

  function onDragStartRow(entry: FileEntry): FileEntry[] {
    const payload =
      selected.size > 0 && selected.has(entry.path)
        ? entries.filter((e) => selected.has(e.path))
        : [entry];
    return payload;
  }

  const bannerVisible = !!intraHover;
  const src =
    intraHover?.entries && intraHover.entries.length > 0
      ? `${activeTab?.host ?? "Remote"}:${intraHover.entries[0].path.replace(/\/[^/]+$/, "") || "/"}`
      : "Remote";
  const target = `Local:${path || "…"}`;

  return (
    <div className="flex flex-col min-w-0 flex-1 relative">
      <DropBanner
        visible={bannerVisible}
        source={src}
        target={target}
        direction="down"
        count={intraHover?.entries?.length}
      />
      <div className="h-6 shrink-0 px-3 flex items-center text-[10px] uppercase tracking-wider text-neutral-500">
        Local · {path || "…"}
      </div>
      <PathBar
        path={path}
        onNavigate={load}
        onUp={onUp}
        onRefresh={() => load(path)}
      />
      <FileTable
        entries={visibleEntries}
        onOpen={onOpen}
        onContextMenu={(entry) =>
          showLocalContextMenu({
            entry,
            onRefresh: () => load(path),
            onNavigate: load,
          })
        }
        loading={loading}
        paneKind="local"
        selected={selected}
        onRowClick={onRowClick}
        onDragStartRow={onDragStartRow}
        droppable
        onDropFiles={onDropFiles}
        onHoverChange={(hovering, entries) =>
          setIntraHover(hovering ? { entries } : null)
        }
      />
    </div>
  );
}
