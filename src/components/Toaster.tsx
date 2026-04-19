import { useEffect, useSyncExternalStore } from "react";
import { toastBus, type ToastItem, type ToastVariant } from "../lib/toast";

const variantClasses: Record<ToastVariant, string> = {
  success: "text-emerald-700 dark:text-emerald-300",
  error: "text-rose-700 dark:text-rose-300",
  info: "text-sky-700 dark:text-sky-300",
  warning: "text-amber-700 dark:text-amber-300",
};

const variantAccent: Record<ToastVariant, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-sky-500",
  warning: "bg-amber-500",
};

function ToastRow({ item }: { item: ToastItem }) {
  useEffect(() => {
    if (item.durationMs <= 0) return;
    const t = window.setTimeout(
      () => toastBus.dismiss(item.id),
      item.durationMs,
    );
    return () => window.clearTimeout(t);
  }, [item.id, item.durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="surface-1 border border-hairline rounded-md shadow-sm w-[320px] overflow-hidden flex items-stretch toast-enter"
    >
      <div className={`w-[3px] shrink-0 ${variantAccent[item.variant]}`} />
      <div className="flex-1 py-2.5 px-3 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div
            className={`text-[13px] font-medium leading-snug ${variantClasses[item.variant]}`}
          >
            {item.message}
          </div>
          {item.detail ? (
            <div className="mt-0.5 text-[12px] text-secondary leading-snug break-words">
              {item.detail}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => toastBus.dismiss(item.id)}
          className="shrink-0 -mr-1 h-5 w-5 inline-flex items-center justify-center rounded text-secondary hover-soft"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function Toaster() {
  const items = useSyncExternalStore(
    toastBus.subscribe,
    toastBus.getSnapshot,
    toastBus.getSnapshot,
  );

  useEffect(() => {
    toastBus.mounted = true;
    return () => {
      toastBus.mounted = false;
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .toast-enter { animation: toast-in 160ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .toast-enter { animation: none; }
        }
      `}</style>
      <div
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastRow item={item} />
          </div>
        ))}
      </div>
    </>
  );
}

export default Toaster;
