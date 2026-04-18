import { useCallback, useState } from "react";
import "./App.css";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { LocalPane } from "./components/LocalPane";
import { RemotePane } from "./components/RemotePane";
import { TabBar } from "./components/TabBar";
import { TitleBar } from "./components/TitleBar";
import { TransferQueuePanel } from "./components/TransferQueuePanel";
import { useDragDrop } from "./hooks/useDragDrop";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { api } from "./lib/api";
import { useSessions } from "./store/sessions";
import { stat } from "@tauri-apps/plugin-fs";

function App() {
  const [connectOpen, setConnectOpen] = useState(false);

  useMenuEvents(
    useCallback((id: string) => {
      if (id === "new_conn") setConnectOpen(true);
      if (id === "close_tab") {
        const st = useSessions.getState();
        if (st.activeId) {
          api.disconnect(
            st.tabs.find((t) => t.id === st.activeId)?.sessionId ?? "",
          ).catch(() => {});
          st.closeTab(st.activeId);
        }
      }
    }, []),
  );

  useDragDrop(
    useCallback(async ({ paths }) => {
      const st = useSessions.getState();
      const active = st.tabs.find((t) => t.id === st.activeId);
      if (!active) return;
      for (const p of paths) {
        try {
          const info = await stat(p).catch(() => null);
          const size = info?.size ?? 0;
          const name = p.split("/").pop() ?? "file";
          const remote = `${active.cwd.replace(/\/$/, "")}/${name}`;
          await api.transferEnqueue(active.sessionId, "upload", p, remote, size);
        } catch {}
      }
    }, []),
  );

  return (
    <div className="h-full w-full flex flex-col bg-white/40 dark:bg-neutral-950/40 text-neutral-900 dark:text-neutral-100">
      <TitleBar onConnect={() => setConnectOpen(true)} />
      <TabBar />
      <div className="flex-1 min-h-0 flex">
        <LocalPane />
        <RemotePane />
      </div>
      <TransferQueuePanel />
      <ConnectionDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}

export default App;
