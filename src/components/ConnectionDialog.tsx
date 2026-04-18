import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { api, type ProtocolKind } from "../lib/api";
import { useSessions } from "../store/sessions";
import { X } from "./icons";

export function ConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [kind, setKind] = useState<ProtocolKind>("sftp");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addTab = useSessions((s) => s.addTab);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const sid = await api.connect({
        kind,
        host,
        port,
        username,
        auth: { kind: "password", password },
        passive: kind !== "sftp",
      });
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
      onOpenChange(false);
      setPassword("");
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] rounded-lg bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold">
              New connection
            </Dialog.Title>
            <Dialog.Close className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Protocol</label>
              <div className="flex gap-1">
                {(["sftp", "ftp", "ftps"] as ProtocolKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setPort(k === "sftp" ? 22 : k === "ftps" ? 990 : 21);
                    }}
                    className={
                      "px-3 py-1 rounded-md text-xs font-medium border " +
                      (kind === k
                        ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
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
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="sftp.example.com"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-sm outline-none focus:border-sky-500"
                />
              </div>
              <div className="w-20">
                <label className="block text-xs text-neutral-500 mb-1">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-sm outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-sm outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-sm outline-none focus:border-sky-500"
              />
            </div>
            {error && (
              <div className="text-xs text-red-500 break-words">{error}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => onOpenChange(false)}
                className="px-3 py-1 text-xs rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={busy || !host || !username}
                onClick={submit}
                className="px-3 py-1 text-xs rounded-md bg-black text-white dark:bg-white dark:text-black disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
