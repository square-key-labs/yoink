import { create } from "zustand";
import type { ConnectionConfig } from "../lib/api";

export interface PendingTofu {
  host: string;
  port: number;
  fingerprint: string;
  config: ConnectionConfig;
}

interface PendingTofuState {
  pending: PendingTofu | null;
  setPending: (p: PendingTofu) => void;
  clear: () => void;
}

export const usePendingTofu = create<PendingTofuState>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
  clear: () => set({ pending: null }),
}));
