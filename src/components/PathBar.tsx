import { ArrowUp, ChevronRight, RotateCw } from "./icons";

export function PathBar({
  path,
  onNavigate,
  onUp,
  onRefresh,
}: {
  path: string;
  onNavigate: (p: string) => void;
  onUp: () => void;
  onRefresh: () => void;
}) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="flex h-8 items-center gap-1 px-2 border-b border-black/5 dark:border-white/5 bg-white/30 dark:bg-neutral-900/30">
      <button
        onClick={onUp}
        title="Parent directory"
        className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onRefresh}
        title="Refresh"
        className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5"
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-0.5 text-xs min-w-0 overflow-hidden">
        <button
          onClick={() => onNavigate("/")}
          className="px-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
        >
          /
        </button>
        {parts.map((p, i) => {
          const sub = "/" + parts.slice(0, i + 1).join("/");
          return (
            <div key={sub} className="flex items-center">
              <ChevronRight className="h-3 w-3 opacity-50" />
              <button
                onClick={() => onNavigate(sub)}
                className="px-1 rounded hover:bg-black/5 dark:hover:bg-white/5 truncate max-w-[180px]"
              >
                {p}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
