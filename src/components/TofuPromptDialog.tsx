import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { api } from "../lib/api";
import { usePendingTofu } from "../store/pendingTofu";
import { useSessions } from "../store/sessions";
import { toast } from "../lib/toast";
import { X } from "./icons";

export function TofuPromptDialog() {
  const pending = usePendingTofu((s) => s.pending);
  const clear = usePendingTofu((s) => s.clear);
  const addTab = useSessions((s) => s.addTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = pending !== null;

  async function onAccept() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api.acceptHostFingerprint(
        pending.host,
        pending.port,
        pending.fingerprint,
      );
      const sid = await api.connect(pending.config);
      addTab({
        id: crypto.randomUUID(),
        sessionId: sid,
        label: `${pending.config.username}@${pending.host}`,
        kind: pending.config.kind,
        host: pending.host,
        cwd: "/",
        entries: [],
        loading: false,
        error: null,
      });
      toast.success(`Accepted fingerprint for ${pending.host}`);
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onCancel() {
    if (busy) return;
    clear();
    setError(null);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[88vh] rounded-lg bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-black/5 dark:border-white/5">
            <Dialog.Title className="text-sm font-semibold">
              Verify host fingerprint
            </Dialog.Title>
            <Dialog.Close
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              aria-label="Close"
              onClick={onCancel}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            First-sight host fingerprint confirmation
          </Dialog.Description>

          <div className="p-5 space-y-4 text-sm">
            <p className="text-[13px] text-neutral-700 dark:text-neutral-300">
              This is your first time connecting to this host. Verify the
              SHA256 fingerprint out-of-band before accepting.
            </p>

            {pending && (
              <div className="space-y-2">
                <Row label="Host" value={pending.host} />
                <Row label="Port" value={String(pending.port)} />
                <div className="rounded-md bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                    SHA256 Fingerprint
                  </div>
                  <div className="mt-1 font-mono text-[12px] break-all leading-snug">
                    {pending.fingerprint}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-xs px-2 py-1.5 break-words">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/5 dark:border-white/5">
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={busy}
              className="accent-button px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy && (
                <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
              )}
              {busy ? "Accepting…" : "Accept"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="text-sm truncate">{value}</div>
    </div>
  );
}

export default TofuPromptDialog;
