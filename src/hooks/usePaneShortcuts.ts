import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import { api, type FileEntry } from "../lib/api";
import { useSessions, type PaneKind } from "../store/sessions";
import { useViewPrefs } from "../store/viewPrefs";

export interface PaneController {
  refresh: () => void;
  getSelectedEntries: () => FileEntry[];
  toggleSearch: () => void;
  clearSelection: () => void;
}

export interface PaneShortcutsOptions {
  local: PaneController | null;
  remote: PaneController | null;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function usePaneShortcuts(opts: PaneShortcutsOptions) {
  const { local, remote } = opts;

  useEffect(() => {
    function getActive(): {
      pane: PaneKind;
      ctrl: PaneController | null;
    } {
      const pane = useSessions.getState().activePane;
      return { pane, ctrl: pane === "local" ? local : remote };
    }

    async function handleDelete() {
      const { pane, ctrl } = getActive();
      if (!ctrl) return;
      const entries = ctrl.getSelectedEntries();
      if (entries.length === 0) return;

      if (pane === "local") {
        try {
          alert("Local delete not supported");
        } catch {}
        return;
      }

      const tab = useSessions
        .getState()
        .tabs.find((t) => t.id === useSessions.getState().activeId);
      if (!tab) return;

      const label =
        entries.length === 1
          ? `"${entries[0].name}"`
          : `${entries.length} items`;
      const ok = await ask(
        `Delete ${label} on ${tab.host}? This cannot be undone.`,
        {
          title: "Delete",
          kind: "warning",
          okLabel: "Delete",
          cancelLabel: "Cancel",
        },
      );
      if (!ok) return;

      for (const e of entries) {
        try {
          await api.remoteRemove(tab.sessionId, e.path);
        } catch (err) {
          alert(`Delete failed for ${e.name}: ${err}`);
        }
      }
      ctrl.clearSelection();
      ctrl.refresh();
    }

    function openInfoForSelection() {
      const { pane, ctrl } = getActive();
      if (!ctrl) return;
      const entries = ctrl.getSelectedEntries();
      if (entries.length !== 1) return;
      useSessions.getState().setInfoEntry({ entry: entries[0], pane });
    }

    function onKey(e: KeyboardEvent) {
      // If user is typing in an input, let the input handle it — but allow Escape
      // and a few global combos even when focused on inputs is handled naturally
      // by the input's onKeyDown. So we bail early when editable.
      const editable = isEditableTarget(e.target);
      const mod = e.metaKey || e.ctrlKey;

      // ⌘R / F5 → refresh
      if ((mod && e.key.toLowerCase() === "r") || e.key === "F5") {
        if (editable) return;
        e.preventDefault();
        getActive().ctrl?.refresh();
        return;
      }

      // ⌘F → toggle search
      if (mod && e.key.toLowerCase() === "f") {
        if (editable) return;
        e.preventDefault();
        getActive().ctrl?.toggleSearch();
        return;
      }

      // ⌘. → toggle hidden
      if (mod && e.key === ".") {
        if (editable) return;
        e.preventDefault();
        useViewPrefs.getState().toggleShowHidden();
        return;
      }

      // ⌘I → file info
      if (mod && e.key.toLowerCase() === "i") {
        if (editable) return;
        e.preventDefault();
        openInfoForSelection();
        return;
      }

      // Delete / Backspace → delete selection
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editable) return;
        e.preventDefault();
        void handleDelete();
        return;
      }

      // Space → preview stub
      if (e.key === " " || e.code === "Space") {
        if (editable) return;
        e.preventDefault();
        alert("Preview coming soon");
        return;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [local, remote]);
}
