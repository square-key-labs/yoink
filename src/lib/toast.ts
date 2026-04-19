// Global toast bus — module singleton, pub/sub.
// Imperative API: `toast.success(msg, { detail, durationMs })` etc.
// Safe to call before <Toaster/> mounts — falls back to console.

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  detail?: string;
  durationMs?: number;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  detail?: string;
  durationMs: number;
  createdAt: number;
}

type Listener = () => void;

const DEFAULT_DURATION_MS = 4000;

class ToastBus {
  private items: ToastItem[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;
  mounted = false;

  getSnapshot = (): ToastItem[] => this.items;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  push(variant: ToastVariant, message: string, opts?: ToastOptions): string {
    if (!this.mounted) {
      // Fallback so toasts before mount aren't silently lost.
      // eslint-disable-next-line no-console
      console.error(
        `[toast:${variant}] ${message}${opts?.detail ? ` — ${opts.detail}` : ""}`,
      );
    }
    this.seq += 1;
    const id = `t_${Date.now()}_${this.seq}`;
    const item: ToastItem = {
      id,
      variant,
      message,
      detail: opts?.detail,
      durationMs: opts?.durationMs ?? DEFAULT_DURATION_MS,
      createdAt: Date.now(),
    };
    this.items = [...this.items, item];
    this.emit();
    return id;
  }

  dismiss(id: string) {
    const next = this.items.filter((t) => t.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    this.emit();
  }
}

export const toastBus = new ToastBus();

export const toast = {
  success: (message: string, opts?: ToastOptions) =>
    toastBus.push("success", message, opts),
  error: (message: string, opts?: ToastOptions) =>
    toastBus.push("error", message, opts),
  info: (message: string, opts?: ToastOptions) =>
    toastBus.push("info", message, opts),
  warning: (message: string, opts?: ToastOptions) =>
    toastBus.push("warning", message, opts),
  dismiss: (id: string) => toastBus.dismiss(id),
};
