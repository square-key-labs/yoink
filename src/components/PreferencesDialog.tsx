import * as Dialog from "@radix-ui/react-dialog";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { useBookmarks } from "../store/bookmarks";
import { useViewPrefs } from "../store/viewPrefs";

type TabKey = "general" | "security";

export function PreferencesDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("general");
  const [busy, setBusy] = useState<null | "forget-pw" | "forget-bm">(null);
  const showHidden = useViewPrefs((s) => s.showHidden);
  const setShowHidden = useViewPrefs((s) => s.setShowHidden);
  const bookmarks = useBookmarks((s) => s.bookmarks);

  useEffect(() => {
    const unlisten = listen<string>("yoink://menu", (e) => {
      if (e.payload === "prefs") setOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const onForgetPasswords = async () => {
    const list = useBookmarks.getState().bookmarks;
    if (list.length === 0) {
      toast.info("No saved bookmarks to clear passwords for");
      return;
    }
    setBusy("forget-pw");
    let ok = 0;
    let failed = 0;
    for (const b of list) {
      try {
        await api.keychainDelete(b.id, "password");
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(null);
    if (failed === 0) {
      toast.success(`Cleared ${ok} saved password${ok === 1 ? "" : "s"}`);
    } else {
      toast.warning(`Cleared ${ok}, failed ${failed}`, {
        detail: "Some keychain entries could not be removed.",
      });
    }
  };

  const onForgetBookmarks = async () => {
    const list = useBookmarks.getState().bookmarks;
    if (list.length === 0) {
      toast.info("No bookmarks to forget");
      return;
    }
    let confirmed = false;
    try {
      confirmed = await ask(
        `Forget all ${list.length} bookmark${list.length === 1 ? "" : "s"}? This also removes saved passwords.`,
        { title: "Forget all bookmarks", kind: "warning" },
      );
    } catch {
      confirmed = window.confirm(
        `Forget all ${list.length} bookmarks? This also removes saved passwords.`,
      );
    }
    if (!confirmed) return;

    setBusy("forget-bm");
    try {
      const remove = useBookmarks.getState().remove;
      for (const b of list) {
        await remove(b.id);
      }
      toast.success("All bookmarks forgotten");
    } catch (e) {
      toast.error("Failed to forget bookmarks", {
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[82vh] rounded-lg bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <Dialog.Title className="text-sm font-semibold">
              Preferences
            </Dialog.Title>
            <Dialog.Close
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Application preferences
          </Dialog.Description>

          <div className="flex flex-1 min-h-0">
            <nav className="w-[140px] shrink-0 border-r border-hairline py-2 px-2 flex flex-col gap-0.5">
              <TabButton
                active={tab === "general"}
                onClick={() => setTab("general")}
              >
                General
              </TabButton>
              <TabButton
                active={tab === "security"}
                onClick={() => setTab("security")}
              >
                Security
              </TabButton>
            </nav>

            <div className="flex-1 min-w-0 overflow-auto p-4">
              {tab === "general" ? (
                <section className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={showHidden}
                      onChange={(e) => setShowHidden(e.target.checked)}
                    />
                    <span>Show hidden files</span>
                  </label>
                  <p className="text-[12px] text-secondary">
                    Show files and folders whose names begin with a dot.
                  </p>
                </section>
              ) : (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[13px] font-medium">
                      Saved passwords
                    </div>
                    <p className="text-[12px] text-secondary">
                      Removes all bookmark passwords from the macOS Keychain.
                      Bookmarks themselves are preserved.
                    </p>
                    <button
                      type="button"
                      disabled={busy !== null || bookmarks.length === 0}
                      onClick={onForgetPasswords}
                      className="self-start mt-1 rounded border border-hairline px-3 py-1.5 text-[12px] hover-soft disabled:opacity-50"
                    >
                      {busy === "forget-pw"
                        ? "Clearing…"
                        : "Forget all saved passwords"}
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="text-[13px] font-medium">Bookmarks</div>
                    <p className="text-[12px] text-secondary">
                      Removes all saved bookmarks along with their keychain
                      entries. This cannot be undone.
                    </p>
                    <button
                      type="button"
                      disabled={busy !== null || bookmarks.length === 0}
                      onClick={onForgetBookmarks}
                      className="self-start mt-1 rounded border border-hairline px-3 py-1.5 text-[12px] text-rose-700 dark:text-rose-300 hover-soft disabled:opacity-50"
                    >
                      {busy === "forget-bm"
                        ? "Forgetting…"
                        : "Forget all bookmarks"}
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-2 border-t border-hairline">
                    <div className="text-[13px] font-medium">
                      Host fingerprints
                    </div>
                    <p className="text-[12px] text-secondary break-words">
                      Host fingerprints stored in
                      ~/Library/Application Support/Yoink/known_hosts
                    </p>
                  </div>
                </section>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left text-[13px] px-2.5 py-1.5 rounded-md hover-soft ${
        active ? "tab-active" : ""
      }`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </button>
  );
}

export default PreferencesDialog;
