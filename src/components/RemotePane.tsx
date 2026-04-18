import { useEffect } from "react";
import { api } from "../lib/api";
import { useSessions } from "../store/sessions";
import type { FileEntry } from "../lib/api";
import { FileTable } from "./FileTable";
import { PathBar } from "./PathBar";

export function RemotePane() {
  const activeTab = useSessions((s) => s.tabs.find((t) => t.id === s.activeId));
  const updateTab = useSessions((s) => s.updateTab);

  async function load(cwd: string) {
    if (!activeTab) return;
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
    const next = activeTab.cwd.replace(/\/[^/]+\/?$/, "") || "/";
    load(next);
  }

  return (
    <div className="flex flex-col min-w-0 flex-1">
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
        entries={activeTab.entries}
        onOpen={onOpen}
        loading={activeTab.loading}
      />
    </div>
  );
}
