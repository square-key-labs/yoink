import * as Dialog from "@radix-ui/react-dialog";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api, type Bookmark, type ConnectionConfig, type ProtocolKind } from "../lib/api";
import { useBookmarks } from "../store/bookmarks";
import { usePendingTofu } from "../store/pendingTofu";
import { useSessions } from "../store/sessions";
import { X } from "./icons";

export interface PrefillPayload {
  bookmark: Bookmark;
  password: string | null;
}

type Mode = "new" | "view" | "edit";

export function ConnectionDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill: PrefillPayload | null;
}) {
  const [mode, setMode] = useState<Mode>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<ProtocolKind>("sftp");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [savePassword, setSavePassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTab = useSessions((s) => s.addTab);
  const bookmarks = useBookmarks((s) => s.bookmarks);
  const loaded = useBookmarks((s) => s.loaded);
  const loadBookmarks = useBookmarks((s) => s.load);
  const upsertBookmark = useBookmarks((s) => s.upsert);
  const removeBookmark = useBookmarks((s) => s.remove);

  useEffect(() => {
    if (open && !loaded) loadBookmarks();
  }, [open, loaded, loadBookmarks]);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
      setBusy(false);
      return;
    }
    if (prefill) selectBookmark(prefill.bookmark);
    else newConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  function newConnection() {
    setMode("new");
    setSelectedId(null);
    setKind("sftp");
    setHost("");
    setPort(22);
    setUsername("");
    setPassword("");
    setRemember(true);
    setSavePassword(true);
    setError(null);
  }

  function selectBookmark(b: Bookmark) {
    setMode("view");
    setSelectedId(b.id);
    setKind(b.kind);
    setHost(b.host);
    setPort(b.port);
    setUsername(b.username);
    setPassword("");
    setRemember(true);
    setSavePassword(true);
    setError(null);
  }

  async function editCurrent() {
    if (!selectedId) return;
    const pw =
      (await api.keychainGetPassword(selectedId).catch(() => null)) ?? "";
    setPassword(pw);
    setMode("edit");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    let pw = password;
    if (mode === "view" && selectedId) {
      pw = (await api.keychainGetPassword(selectedId).catch(() => null)) ?? "";
    }
    const config: ConnectionConfig = {
      kind,
      host,
      port,
      username,
      auth: { kind: "password", password: pw },
      passive: kind !== "sftp",
    };
    try {
      const sid = await api.connect(config);
      addTab({
        id: crypto.randomUUID(),
        sessionId: sid,
        label: `${username}@${host}`,
        kind,
        host,
        cwd: "/",
        entries: [],
        loading: false,
        error: null,
      });
      if (remember && mode !== "view") {
        const id = selectedId ?? crypto.randomUUID();
        await upsertBookmark(
          {
            id,
            label: `${username}@${host}`,
            kind,
            host,
            port,
            username,
            auth_ref: { kind: "password" },
          },
          savePassword ? pw : "",
        );
      }
      onOpenChange(false);
      setPassword("");
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message ?? String(e);
      const tofu = parseUnknownHost(msg, e);
      if (tofu) {
        usePendingTofu.getState().setPending({
          host: tofu.host ?? host,
          port: tofu.port ?? port,
          fingerprint: tofu.fingerprint,
          config,
        });
        onOpenChange(false);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const selected = bookmarks.find((b) => b.id === selectedId) ?? null;
  const canSubmit =
    !busy &&
    (mode === "view" ? !!selected : !!host && !!username);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-h-[88vh] rounded-lg bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col">
          {busy && (
            <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
              <div className="h-full w-1/3 bg-[rgb(var(--accent))] animate-[slide_1.1s_ease-in-out_infinite]" />
            </div>
          )}
          <div className="flex items-center justify-between px-5 py-3 border-b border-black/5 dark:border-white/5">
            <Dialog.Title className="text-sm font-semibold">Connect</Dialog.Title>
            <Dialog.Close className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 min-h-0 flex">
            {/* Saved list */}
            <div className="w-[240px] shrink-0 border-r border-black/5 dark:border-white/5 overflow-auto bg-black/[0.015] dark:bg-white/[0.02]">
              <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-neutral-500 flex items-center justify-between">
                <span>Saved · {bookmarks.length}</span>
                <button
                  onClick={newConnection}
                  className={
                    "text-[11px] normal-case tracking-normal text-[rgb(var(--accent))] " +
                    (mode === "new" ? "font-medium" : "hover:brightness-110")
                  }
                >
                  + New
                </button>
              </div>
              {bookmarks.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-neutral-500 leading-relaxed">
                  No saved connections. Check "Remember" when you connect.
                </div>
              )}
              {bookmarks.map((b) => {
                const active = selectedId === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => selectBookmark(b)}
                    className={
                      "group px-3 py-2 text-xs cursor-pointer border-l-2 transition-colors " +
                      (active
                        ? "border-[rgb(var(--accent))] bg-accent-soft"
                        : "border-transparent hover-soft")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{b.label}</div>
                        <div className="text-[10px] text-neutral-500 truncate">
                          {b.kind} · {b.host}:{b.port}
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await ask(
                            `Delete the saved connection "${b.label}"? This removes its stored password from the keychain.`,
                            {
                              title: "Delete bookmark",
                              kind: "warning",
                              okLabel: "Delete",
                              cancelLabel: "Cancel",
                            },
                          );
                          if (ok) removeBookmark(b.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-500 ml-2 shrink-0"
                        title="Delete"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right panel */}
            <div className="flex-1 min-w-0 p-5 overflow-auto">
              {mode === "view" && selected ? (
                <ViewPanel
                  bookmark={selected}
                  busy={busy}
                  onEdit={editCurrent}
                  onForget={async () => {
                    const ok = await ask(
                      `Forget the stored password for "${selected.label}"? You'll need to re-enter it next time you connect.`,
                      {
                        title: "Forget password",
                        kind: "warning",
                        okLabel: "Forget",
                        cancelLabel: "Cancel",
                      },
                    );
                    if (ok) {
                      api.keychainDelete(selected.id, "password").catch(() => {});
                    }
                  }}
                />
              ) : (
                <EditForm
                  kind={kind}
                  setKind={(k) => {
                    setKind(k);
                    setPort(k === "sftp" ? 22 : k === "ftps" ? 990 : 21);
                  }}
                  host={host}
                  setHost={setHost}
                  port={port}
                  setPort={setPort}
                  username={username}
                  setUsername={setUsername}
                  password={password}
                  setPassword={setPassword}
                  remember={remember}
                  setRemember={setRemember}
                  savePassword={savePassword}
                  setSavePassword={setSavePassword}
                  onEnter={() => canSubmit && submit()}
                />
              )}
              {error && (
                <div className="mt-3 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-xs px-2 py-1.5 break-words">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-black/5 dark:border-white/5">
            <div className="text-[11px] text-neutral-500">
              {busy
                ? "Connecting — negotiating KEX, auth, opening SFTP…"
                : mode === "view"
                  ? "Press Enter or click Reconnect"
                  : mode === "edit"
                    ? "Editing saved connection"
                    : "New connection"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 text-xs rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={!canSubmit}
                onClick={submit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) submit();
                }}
                autoFocus={mode === "view"}
                className="accent-button px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5"
              >
                {busy && (
                  <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
                )}
                {busy
                  ? "Connecting…"
                  : mode === "view"
                    ? "Reconnect"
                    : "Connect"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ViewPanel({
  bookmark,
  busy,
  onEdit,
  onForget,
}: {
  bookmark: Bookmark;
  busy: boolean;
  onEdit: () => void;
  onForget: () => void;
}) {
  const initials = bookmark.username.slice(0, 2).toUpperCase();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white flex items-center justify-center font-semibold text-lg shadow-sm">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">
            {bookmark.label}
          </div>
          <div className="text-xs text-neutral-500 truncate">
            Ready to reconnect · password stored in keychain
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Protocol" value={bookmark.kind.toUpperCase()} />
        <Field label="Port" value={String(bookmark.port)} />
        <Field label="Host" value={bookmark.host} />
        <Field label="Username" value={bookmark.username} />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onEdit}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          onClick={onForget}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 disabled:opacity-50"
        >
          Forget password
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="text-sm truncate">{value}</div>
    </div>
  );
}

function EditForm(p: {
  kind: ProtocolKind;
  setKind: (k: ProtocolKind) => void;
  host: string;
  setHost: (v: string) => void;
  port: number;
  setPort: (n: number) => void;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  savePassword: boolean;
  setSavePassword: (v: boolean) => void;
  onEnter: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Protocol</label>
        <div className="flex gap-1">
          {(["sftp", "ftp", "ftps"] as ProtocolKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => p.setKind(k)}
              className={
                "px-3 py-1 rounded-md text-xs font-medium border transition-colors " +
                (p.kind === k
                  ? "bg-accent-soft text-[rgb(var(--accent))] border-transparent"
                  : "border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5")
              }
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-neutral-500 mb-1">Host</label>
          <input
            value={p.host}
            onChange={(e) => p.setHost(e.target.value)}
            placeholder="sftp.example.com"
            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
          />
        </div>
        <div className="w-20">
          <label className="block text-xs text-neutral-500 mb-1">Port</label>
          <input
            type="number"
            value={p.port}
            onChange={(e) => p.setPort(parseInt(e.target.value) || 22)}
            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Username</label>
        <input
          value={p.username}
          onChange={(e) => p.setUsername(e.target.value)}
          className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Password</label>
        <input
          type="password"
          value={p.password}
          onChange={(e) => p.setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") p.onEnter();
          }}
          className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
        />
      </div>
      <div className="flex items-center gap-4 pt-1">
        <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
          <input
            type="checkbox"
            checked={p.remember}
            onChange={(e) => p.setRemember(e.target.checked)}
            className="accent-sky-500"
          />
          Remember
        </label>
        <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
          <input
            type="checkbox"
            checked={p.savePassword}
            disabled={!p.remember}
            onChange={(e) => p.setSavePassword(e.target.checked)}
            className="accent-sky-500"
          />
          Save password in keychain
        </label>
      </div>
    </div>
  );
}

interface UnknownHostInfo {
  host?: string;
  port?: number;
  fingerprint: string;
}

function parseUnknownHost(msg: string, raw: unknown): UnknownHostInfo | null {
  // Preferred: structured payload on the error object.
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const code =
      typeof r.code === "string"
        ? r.code.toLowerCase()
        : typeof r.kind === "string"
          ? (r.kind as string).toLowerCase()
          : "";
    const fp =
      typeof r.fingerprint === "string"
        ? r.fingerprint
        : typeof r.sha256 === "string"
          ? r.sha256
          : "";
    if (fp && (code.includes("unknown") || code.includes("tofu") || code.includes("fingerprint"))) {
      return {
        host: typeof r.host === "string" ? r.host : undefined,
        port: typeof r.port === "number" ? r.port : undefined,
        fingerprint: fp,
      };
    }
  }

  // Fallback: parse the shape `"unknown host — fingerprint confirmation required"`
  // optionally followed by a JSON payload or `fingerprint=...`.
  if (!msg) return null;
  if (!/unknown host/i.test(msg)) return null;

  // Try embedded JSON first.
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const fp =
        typeof obj.fingerprint === "string"
          ? obj.fingerprint
          : typeof obj.sha256 === "string"
            ? obj.sha256
            : "";
      if (fp) {
        return {
          host: typeof obj.host === "string" ? obj.host : undefined,
          port: typeof obj.port === "number" ? obj.port : undefined,
          fingerprint: fp,
        };
      }
    } catch {
      // fall through
    }
  }

  // Try `fingerprint=SHA256:...` or bare SHA256:base64.
  const kvMatch = msg.match(/fingerprint\s*[:=]\s*([A-Za-z0-9+/:._=-]+)/i);
  if (kvMatch) {
    return { fingerprint: kvMatch[1] };
  }
  const shaMatch = msg.match(/SHA256:[A-Za-z0-9+/=]+/);
  if (shaMatch) {
    return { fingerprint: shaMatch[0] };
  }

  // UnknownHost detected but no fingerprint embedded — trigger dialog with empty
  // fingerprint as a last resort so the user still sees the prompt.
  return { fingerprint: "" };
}
