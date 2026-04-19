import { useCallback, useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import "./App.css";
import {
  ConnectionDialog,
  type PrefillPayload,
} from "./components/ConnectionDialog";
import { LocalPane } from "./components/LocalPane";
import { RemotePane } from "./components/RemotePane";
import { TabBar } from "./components/TabBar";
import { TitleBar } from "./components/TitleBar";
import { TransferQueuePanel } from "./components/TransferQueuePanel";
import { useDragDrop } from "./hooks/useDragDrop";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { api } from "./lib/api";
import { toast } from "./lib/toast";
import { useBookmarks } from "./store/bookmarks";
import { useSessions } from "./store/sessions";
import { stat } from "@tauri-apps/plugin-fs";

function App() {
  const [connectOpen, setConnectOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null);
  const loadBookmarks = useBookmarks((s) => s.load);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const openConnect = useCallback((p?: PrefillPayload | null) => {
    setPrefill(p ?? null);
    setConnectOpen(true);
  }, []);

  useMenuEvents(
    useCallback((id: string) => {
      if (id === "new_conn") {
        setPrefill(null);
        setConnectOpen(true);
      }
      if (id === "close_tab") {
        const st = useSessions.getState();
        if (st.activeId) {
          const t = st.tabs.find((x) => x.id === st.activeId);
          if (t) api.disconnect(t.sessionId).catch(() => {});
          st.closeTab(st.activeId);
        }
      }
    }, []),
  );

  const drag = useDragDrop(
    useCallback(async (paths: string[]) => {
      const st = useSessions.getState();
      const active = st.tabs.find((t) => t.id === st.activeId);
      if (!active) {
        toast.warning("No active connection", {
          detail: "Open a connection first, then drop files.",
        });
        return;
      }
      if (!paths || paths.length === 0) {
        toast.warning("Drop received but empty", {
          detail: "No file paths in the drop payload.",
        });
        return;
      }
      let queued = 0;
      let failed = 0;
      for (const p of paths) {
        try {
          const info = await stat(p).catch(() => null);
          const size = info?.size ?? 0;
          const name = p.split("/").pop() ?? "file";
          const remote = `${active.cwd.replace(/\/$/, "")}/${name}`;
          await api.transferEnqueue(active.sessionId, "upload", p, remote, size);
          queued++;
        } catch (e: any) {
          failed++;
          console.error("enqueue failed", p, e);
          toast.error(`Upload queue failed for ${p.split("/").pop()}`, {
            detail: typeof e === "string" ? e : e?.message ?? String(e),
          });
        }
      }
      if (queued > 0)
        toast.success(`Queued ${queued} upload${queued === 1 ? "" : "s"}`, {
          detail: `To ${active.host}:${active.cwd}`,
        });
    }, []),
  );


  return (
    <div className="h-full w-full flex flex-col relative">
      <TitleBar onConnect={() => openConnect(null)} />
      <TabBar />
      <Group
        orientation="horizontal"
        className="flex-1 min-h-0 flex"
      >
        <Panel defaultSize="50%" minSize="20%" className="flex flex-col min-w-0">
          <LocalPane />
        </Panel>
        <Separator className="w-px my-2 bg-[var(--border-hairline)] hover:w-[3px] hover:bg-[rgb(var(--accent))]/60 active:bg-[rgb(var(--accent))]/80 transition-all cursor-col-resize shrink-0" />
        <Panel defaultSize="50%" minSize="20%" className="flex flex-col min-w-0">
          <RemotePane
            externalDragHover={drag.phase === "over"}
            externalDragPaths={drag.paths}
          />
        </Panel>
      </Group>
      <TransferQueuePanel />
      <ConnectionDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        prefill={prefill}
      />
    </div>
  );
}

export default App;
