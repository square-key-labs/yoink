import { create } from "zustand";

const STORAGE_KEY = "yoink:viewPrefs";

function loadInitial(): { showHidden: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { showHidden: false };
    const parsed = JSON.parse(raw);
    return { showHidden: !!parsed?.showHidden };
  } catch {
    return { showHidden: false };
  }
}

function persist(state: { showHidden: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

interface ViewPrefsState {
  showHidden: boolean;
  setShowHidden: (v: boolean) => void;
  toggleShowHidden: () => void;
}

export const useViewPrefs = create<ViewPrefsState>((set, get) => ({
  ...loadInitial(),
  setShowHidden: (v) => {
    set({ showHidden: v });
    persist({ showHidden: v });
  },
  toggleShowHidden: () => {
    const next = !get().showHidden;
    set({ showHidden: next });
    persist({ showHidden: next });
  },
}));
