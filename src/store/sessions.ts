import { create } from "zustand";
import type { FileEntry, ProtocolKind } from "../lib/api";

export interface Tab {
  id: string;
  label: string;
  sessionId: string;
  kind: ProtocolKind;
  host: string;
  cwd: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
}

export type PaneKind = "local" | "remote";

interface SessionsState {
  tabs: Tab[];
  activeId: string | null;
  activePane: PaneKind;
  infoEntry: { entry: FileEntry; pane: PaneKind } | null;
  addTab: (t: Tab) => void;
  setActive: (id: string) => void;
  closeTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
  setActivePane: (p: PaneKind) => void;
  setInfoEntry: (v: { entry: FileEntry; pane: PaneKind } | null) => void;
}

export const useSessions = create<SessionsState>((set) => ({
  tabs: [],
  activeId: null,
  activePane: "local",
  infoEntry: null,
  addTab: (t) => set((s) => ({ tabs: [...s.tabs, t], activeId: t.id })),
  setActive: (id) => set({ activeId: id }),
  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeId =
        s.activeId === id ? (tabs[0]?.id ?? null) : s.activeId;
      return { tabs, activeId };
    }),
  updateTab: (id, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  setActivePane: (p) => set({ activePane: p }),
  setInfoEntry: (v) => set({ infoEntry: v }),
}));
