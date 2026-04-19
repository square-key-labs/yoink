import { ask } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { useSessions } from "../store/sessions";
import { X } from "./icons";

export function TabBar() {
  const tabs = useSessions((s) => s.tabs);
  const activeId = useSessions((s) => s.activeId);
  const setActive = useSessions((s) => s.setActive);
  const closeTab = useSessions((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 px-2 border-b border-hairline surface-2 overflow-x-auto">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeId}
          tabIndex={0}
          onClick={() => setActive(t.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActive(t.id);
            }
          }}
          className={
            "group flex items-center gap-1.5 pl-3 pr-1.5 h-6 rounded-md text-xs cursor-pointer shrink-0 leading-none animate-fade-in transition-colors " +
            (t.id === activeId
              ? "tab-active font-medium"
              : "text-secondary hover-soft")
          }
        >
          <span className="max-w-[200px] truncate leading-none">{t.label}</span>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const transfers = await api.transferList();
                const active = transfers.filter(
                  (x) =>
                    x.session_id === t.sessionId &&
                    (x.state === "running" || x.state === "queued"),
                );
                if (active.length > 0) {
                  const ok = await ask(
                    `Close "${t.label}"? ${active.length} transfer${active.length === 1 ? " is" : "s are"} still in progress and will be cancelled.`,
                    {
                      title: "Close connection",
                      kind: "warning",
                      okLabel: "Close",
                      cancelLabel: "Cancel",
                    },
                  );
                  if (!ok) return;
                }
              } catch {
                // If transferList fails, fall through to close silently.
              }
              api.disconnect(t.sessionId).catch(() => {});
              closeTab(t.id);
            }}
            className="flex items-center justify-center h-4 w-4 rounded opacity-40 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
