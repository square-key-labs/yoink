import { listen } from "@tauri-apps/api/event";
import { stat } from "@tauri-apps/plugin-fs";
import { useEffect, useRef, useState } from "react";
import { api, type FileEntry } from "../lib/api";
import { showRemoteContextMenu } from "../lib/contextMenu";
import { useSessions } from "../store/sessions";
import { useViewPrefs } from "../store/viewPrefs";
import { DropBanner } from "./DropBanner";
import { FileTable } from "./FileTable";
import { PathBar } from "./PathBar";

export function RemotePane({
  externalDragHover,
  externalDragPaths,
}: {
  externalDragHover?: boolean;
  externalDragPaths?: string[];
}) {
  const activeTab = useSessions((s) => s.tabs.find((t) => t.id === s.activeId));
  const updateTab = useSessions((s) => s.updateTab);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [intraHover, setIntraHover] = useState<{
    entries: FileEntry[] | null;
  } | null>(null);
  const showHidden = useViewPrefs((s) => s.showHidden);

  async function load(cwd: string) {
    if (!activeTab) return;
    setSelected(new Set());
    updateTab(activeTab.id, { loading: true, error: null, cwd });
    try {
      const entries = await api.listDir(activeTab.sessionId, cwd);
      updateTab(activeTab.id, { entries, loading: false });
    } catch (e: any) {
      updateTab(activeTab.id, {
        loading: false,
        entries: [],
        error: typeof e === "string" ? e : e?.message ?? String(e),
      });
    }
  }

  useEffect(() => {
    if (activeTab && activeTab.entries.length === 0 && !activeTab.loading) {
      load(activeTab.cwd || "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!activeTab) return;
    const sessionId = activeTab.sessionId;
    const unlisten = listen<any>("yoink://transfer", (evt) => {
      try {
        const p = evt.payload;
        if (p?.state === "done") {
          const tab = useSessions
            .getState()
            .tabs.find((t) => t.sessionId === sessionId);
          if (tab) loadRef.current(tab.cwd || "/");
        }
      } catch {}
    });
    return () => {
      unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.sessionId]);

  useEffect(() => {
    setSelected(new Set());
  }, [activeTab?.id]);

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">
        No active connection. Click <b className="mx-1">Connect</b> to get started.
      </div>
    );
  }

  function onOpen(entry: FileEntry) {
    if (entry.kind === "dir") load(entry.path);
  }

  function onUp() {
    if (!activeTab) return;
    const parts = activeTab.cwd.split("/").filter(Boolean);
    if (parts.length === 0) return; // already at root
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

  async function onDropFiles(
    localEntries: FileEntry[],
    fromPane: "local" | "remote",
  ) {
    if (fromPane !== "local" || !activeTab) return;
    for (const e of localEntries) {
      if (e.kind === "dir") continue;
      const remote = `${activeTab.cwd.replace(/\/$/, "")}/${e.name}`;
      try {
        const info = await stat(e.path).catch(() => null);
        const size = info?.size ?? e.size ?? 0;
        await api.transferEnqueue(
          activeTab.sessionId,
          "upload",
          e.path,
          remote,
          size,
        );
      } catch {}
    }
  }

  function onDragStartRow(entry: FileEntry): FileEntry[] {
    const payload =
      selected.size > 0 && selected.has(entry.path)
        ? activeTab!.entries.filter((e) => selected.has(e.path))
        : [entry];
    return payload;
  }

  const intraActive = !!intraHover;
  const extActive = !intraActive && !!externalDragHover;
  const bannerVisible = intraActive || extActive;
  const bannerSource = intraActive
    ? intraHover?.entries && intraHover.entries.length > 0
      ? `Local:${intraHover.entries[0].path.replace(/\/[^/]+$/, "") || "/"}`
      : "Local"
    : externalDragPaths && externalDragPaths.length > 0
      ? `Finder:${externalDragPaths[0].replace(/\/[^/]+$/, "") || "/"}`
      : "Finder";
  const bannerTarget = `${activeTab.host}:${activeTab.cwd}`;
  const bannerCount = intraActive
    ? intraHover?.entries?.length
    : externalDragPaths?.length;

  return (
    <div className="flex flex-col min-w-0 flex-1 relative">
      <DropBanner
        visible={bannerVisible}
        source={bannerSource}
        target={bannerTarget}
        direction="up"
        count={bannerCount}
      />
      <div className="h-6 shrink-0 px-3 flex items-center text-[10px] uppercase tracking-wider text-neutral-500 justify-between">
        <span>
          {activeTab.kind.toUpperCase()} · {activeTab.host} · {activeTab.cwd}
        </span>
        {activeTab.error && (
          <span className="text-red-500 normal-case tracking-normal text-[10px]">
            {activeTab.error}
          </span>
        )}
      </div>
      <PathBar
        path={activeTab.cwd}
        onNavigate={load}
        onUp={onUp}
        onRefresh={() => load(activeTab.cwd)}
      />
      <FileTable
        entries={showHidden ? activeTab.entries : activeTab.entries.filter((e) => !e.name.startsWith("."))}
        onOpen={onOpen}
        onContextMenu={(entry) =>
          showRemoteContextMenu({
            entry,
            sessionId: activeTab.sessionId,
            cwd: activeTab.cwd,
            onRefresh: () => load(activeTab.cwd),
            onNavigate: (p) => load(p),
          })
        }
        loading={activeTab.loading}
        paneKind="remote"
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
