import { create } from "zustand";

const STORAGE_KEY = "yoink:viewPrefs";

export type SortKey = "name" | "size" | "modified" | "perms";
export type SortDir = "asc" | "desc";

interface PersistedPrefs {
  showHidden: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
}

const DEFAULTS: PersistedPrefs = {
  showHidden: false,
  sortKey: "name",
  sortDir: "asc",
};

function loadInitial(): PersistedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) ?? {};
    const sortKey: SortKey =
      parsed.sortKey === "size" ||
      parsed.sortKey === "modified" ||
      parsed.sortKey === "perms" ||
      parsed.sortKey === "name"
        ? parsed.sortKey
        : DEFAULTS.sortKey;
    const sortDir: SortDir = parsed.sortDir === "desc" ? "desc" : "asc";
    return {
      showHidden: !!parsed?.showHidden,
      sortKey,
      sortDir,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state: PersistedPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

interface ViewPrefsState extends PersistedPrefs {
  setShowHidden: (v: boolean) => void;
  toggleShowHidden: () => void;
  setSortKey: (k: SortKey) => void;
  setSortDir: (d: SortDir) => void;
  setSort: (k: SortKey, d: SortDir) => void;
}

export const useViewPrefs = create<ViewPrefsState>((set, get) => ({
  ...loadInitial(),
  setShowHidden: (v) => {
    const { sortKey, sortDir } = get();
    set({ showHidden: v });
    persist({ showHidden: v, sortKey, sortDir });
  },
  toggleShowHidden: () => {
    const { showHidden, sortKey, sortDir } = get();
    const next = !showHidden;
    set({ showHidden: next });
    persist({ showHidden: next, sortKey, sortDir });
  },
  setSortKey: (k) => {
    const { showHidden, sortDir } = get();
    set({ sortKey: k });
    persist({ showHidden, sortKey: k, sortDir });
  },
  setSortDir: (d) => {
    const { showHidden, sortKey } = get();
    set({ sortDir: d });
    persist({ showHidden, sortKey, sortDir: d });
  },
  setSort: (k, d) => {
    const { showHidden } = get();
    set({ sortKey: k, sortDir: d });
    persist({ showHidden, sortKey: k, sortDir: d });
  },
}));
