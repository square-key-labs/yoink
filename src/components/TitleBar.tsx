import { Plus } from "./icons";

export function TitleBar({ onConnect }: { onConnect: () => void }) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-2 pl-20 pr-3 border-b border-black/10 dark:border-white/10 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md"
    >
      <span className="text-sm font-medium tracking-tight">Yoink</span>
      <div className="flex-1" data-tauri-drag-region />
      <button
        onClick={onConnect}
        className="flex items-center gap-1 rounded-md bg-black/80 dark:bg-white text-white dark:text-black px-2.5 py-1 text-xs font-medium hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" />
        Connect
      </button>
    </div>
  );
}
