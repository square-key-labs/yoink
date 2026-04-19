import { useEffect } from "react";
import { api, type Auth, type Bookmark } from "../lib/api";
import { toast } from "../lib/toast";
import { useBookmarks } from "../store/bookmarks";
import { useSessions, type Tab } from "../store/sessions";

// Matches transport/session-drop error strings we consider transient.
const DROP_PATTERN = /not connected|timed? out|connection (closed|reset|aborted|refused)|broken pipe|host unreachable|disconnect/i;

// Per-tab reconnect cooldown (ms). Max 1 attempt per tab per window.
const COOLDOWN_MS = 30_000;

interface AttemptState {
  lastAttemptAt: number;
  inFlight: boolean;
}

function findBookmark(bookmarks: Bookmark[], tab: Tab): Bookmark | undefined {
  // We don't have username on Tab, so we match by kind + host. If multiple
  // bookmarks share host+kind we just pick the first — good enough for v1.
  return bookmarks.find((b) => b.kind === tab.kind && b.host === tab.host);
}

async function reconnect(tab: Tab, bookmark: Bookmark): Promise<void> {
  toast.info(`Reconnecting to ${tab.host}…`);
  try {
    let auth: Auth;
    if (bookmark.auth_ref.kind === "password") {
      const pw = await api
        .keychainGetPassword(bookmark.id)
        .catch(() => null);
      if (!pw) {
        toast.error(`Reconnect to ${tab.host} failed`, {
          detail: "No saved password in Keychain.",
        });
        return;
      }
      auth = { kind: "password", password: pw };
    } else if (bookmark.auth_ref.kind === "agent") {
      auth = { kind: "agent" };
    } else {
      // Key-based auth would need the private key body — we don't store it
      // client-side, and we're not allowed to touch api.ts, so skip.
      toast.warning(`Cannot auto-reconnect ${tab.host}`, {
        detail: "Key-based bookmarks require manual reconnect.",
      });
      return;
    }

    const sessionId = await api.connect({
      kind: bookmark.kind,
      host: bookmark.host,
      port: bookmark.port,
      username: bookmark.username,
      auth,
    });

    useSessions.getState().updateTab(tab.id, {
      sessionId,
      error: null,
      loading: false,
    });
    toast.success(`Reconnected to ${tab.host}`);
  } catch (e) {
    toast.error(`Reconnect to ${tab.host} failed`, {
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

export function useAutoReconnect() {
  useEffect(() => {
    const attempts = new Map<string, AttemptState>();

    const tick = () => {
      const { tabs } = useSessions.getState();
      const { bookmarks } = useBookmarks.getState();
      const now = Date.now();

      for (const tab of tabs) {
        if (!tab.error || !DROP_PATTERN.test(tab.error)) continue;

        const state = attempts.get(tab.id) ?? {
          lastAttemptAt: 0,
          inFlight: false,
        };
        if (state.inFlight) continue;
        if (now - state.lastAttemptAt < COOLDOWN_MS) continue;

        const bookmark = findBookmark(bookmarks, tab);
        if (!bookmark) continue;

        state.inFlight = true;
        state.lastAttemptAt = now;
        attempts.set(tab.id, state);

        reconnect(tab, bookmark).finally(() => {
          const s = attempts.get(tab.id);
          if (s) {
            s.inFlight = false;
            attempts.set(tab.id, s);
          }
        });
      }
    };

    // React to session changes immediately; also tick periodically so cooldown
    // windows re-evaluate even without a store update.
    const unsubSessions = useSessions.subscribe(tick);
    const unsubBookmarks = useBookmarks.subscribe(tick);
    const interval = window.setInterval(tick, 5_000);
    // Prime once.
    tick();

    return () => {
      unsubSessions();
      unsubBookmarks();
      window.clearInterval(interval);
    };
  }, []);
}

export function AutoReconnectMount() {
  useAutoReconnect();
  return null;
}

export default AutoReconnectMount;
