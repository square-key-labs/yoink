import { create } from "zustand";
import { api, type Bookmark } from "../lib/api";

interface BookmarksState {
  bookmarks: Bookmark[];
  loaded: boolean;
  load: () => Promise<void>;
  upsert: (b: Bookmark, password?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBookmarks = create<BookmarksState>((set, get) => ({
  bookmarks: [],
  loaded: false,
  load: async () => {
    try {
      const file = await api.bookmarksLoad();
      set({ bookmarks: file.bookmarks ?? [], loaded: true });
    } catch {
      set({ bookmarks: [], loaded: true });
    }
  },
  upsert: async (b, password) => {
    const prev = get().bookmarks.filter((x) => x.id !== b.id);
    const next = [...prev, b];
    await api.bookmarksSave({ version: 1, bookmarks: next });
    if (password !== undefined) {
      if (password) {
        await api.keychainSetPassword(b.id, password).catch(() => {});
      } else {
        await api.keychainDelete(b.id, "password").catch(() => {});
      }
    }
    set({ bookmarks: next });
  },
  remove: async (id) => {
    const next = get().bookmarks.filter((x) => x.id !== id);
    await api.bookmarksSave({ version: 1, bookmarks: next });
    await api.keychainDelete(id, "password").catch(() => {});
    set({ bookmarks: next });
  },
}));
