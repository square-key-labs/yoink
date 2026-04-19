import { Plus } from "./icons";

export function Toolbar({ onConnect }: { onConnect: () => void }) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-[38px] shrink-0 items-center justify-end gap-2 pl-[88px] pr-3 bg-transparent"
    >
      <button
        onClick={onConnect}
        className="flex items-center gap-1.5 rounded-md bg-black/80 dark:bg-white text-white dark:text-black px-3 py-1.5 text-sm font-medium hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Connect
      </button>
    </div>
  );
}
