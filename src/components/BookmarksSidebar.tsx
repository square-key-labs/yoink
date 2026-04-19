import { useEffect, useState } from "react";
import { api, type Bookmark } from "../lib/api";
import { useBookmarks } from "../store/bookmarks";
import { useSessions } from "../store/sessions";
import { X } from "./icons";

export function BookmarksSidebar({
  onPrefill,
}: {
  onPrefill: (b: Bookmark, password: string | null) => void;
}) {
  const bookmarks = useBookmarks((s) => s.bookmarks);
  const loaded = useBookmarks((s) => s.loaded);
  const load = useBookmarks((s) => s.load);
  const remove = useBookmarks((s) => s.remove);
  const addTab = useSessions((s) => s.addTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  async function quickConnect(b: Bookmark) {
    setBusy(b.id);
    setError(null);
    try {
      let password = "";
      if (b.auth_ref.kind === "password") {
        password = (await api.keychainGetPassword(b.id)) ?? "";
        if (!password) {
          onPrefill(b, null);
          return;
        }
      }
      const sid = await api.connect({
        kind: b.kind,
        host: b.host,
        port: b.port,
        username: b.username,
        auth:
          b.auth_ref.kind === "password"
            ? { kind: "password", password }
            : b.auth_ref.kind === "agent"
              ? { kind: "agent" }
              : { kind: "password", password: "" },
        passive: b.kind !== "sftp",
      });
      addTab({
        id: crypto.randomUUID(),
        sessionId: sid,
        label: `${b.username}@${b.host}`,
        kind: b.kind,
        host: b.host,
        cwd: b.initial_path || "/",
        entries: [],
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-[220px] shrink-0 flex flex-col border-r border-black/5 dark:border-white/5 bg-white/20 dark:bg-neutral-900/20">
      <div className="h-6 shrink-0 px-3 flex items-center text-[10px] uppercase tracking-wider text-neutral-500">
        Saved · {bookmarks.length}
      </div>
      <div className="flex-1 overflow-auto">
        {bookmarks.length === 0 && (
          <div className="p-3 text-xs text-neutral-500 leading-relaxed">
            No saved connections yet. Check "Remember" when you connect.
          </div>
        )}
        {bookmarks.map((b) => {
          const connecting = busy === b.id;
          return (
            <div
              key={b.id}
              className={
                "group flex items-center gap-2 px-3 py-1.5 text-xs cursor-default " +
                (connecting
                  ? "bg-sky-500/10 dark:bg-sky-400/10"
                  : "hover:bg-black/5 dark:hover:bg-white/5")
              }
            >
              {connecting ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500 animate-pulse"
                  aria-hidden
                />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0" aria-hidden />
              )}
              <button
                onClick={() => quickConnect(b)}
                disabled={connecting}
                className={
                  "flex-1 min-w-0 text-left " +
                  (connecting ? "opacity-60" : "")
                }
              >
                <div className="font-medium truncate flex items-center gap-1.5">
                  {b.label}
                  {connecting && (
                    <span className="text-[10px] text-sky-600 dark:text-sky-400 font-normal">
                      connecting…
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-500 truncate">
                  {b.kind} · {b.username}@{b.host}:{b.port}
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(b.id);
                }}
                disabled={connecting}
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-500 disabled:opacity-0"
                title="Delete"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {error && (
          <div className="p-3 text-[11px] text-red-500 break-words">{error}</div>
        )}
      </div>
    </div>
  );
}
