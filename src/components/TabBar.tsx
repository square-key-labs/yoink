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
    <div className="flex h-8 shrink-0 items-center gap-1 px-2 border-b border-black/5 dark:border-white/5 bg-white/30 dark:bg-neutral-900/30 overflow-x-auto">
      {tabs.map((t) => (
        <div
          key={t.id}
          onClick={() => setActive(t.id)}
          className={
            "group flex items-center gap-2 px-3 h-6 rounded-md text-xs cursor-default shrink-0 " +
            (t.id === activeId
              ? "bg-black/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5")
          }
        >
          <span className="max-w-[200px] truncate">{t.label}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              api.disconnect(t.sessionId).catch(() => {});
              closeTab(t.id);
            }}
            className="opacity-40 group-hover:opacity-100 hover:text-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
