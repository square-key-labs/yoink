export function DropBanner({
  visible,
  source,
  target,
  direction,
  count,
}: {
  visible: boolean;
  source: string;
  target: string;
  direction: "up" | "down";
  count?: number;
}) {
  if (!visible) return null;
  const arrow = direction === "up" ? "→" : "←";
  return (
    <div className="absolute left-0 right-0 top-0 z-40 mx-3 mt-2 pointer-events-none animate-slide-down">
      <div className="flex items-center gap-2 rounded-md bg-sky-500/95 dark:bg-sky-500/90 text-white px-3 py-1.5 text-xs shadow-lg shadow-sky-500/30 border border-sky-400/50">
        <span className="font-mono text-[10px] opacity-90 truncate max-w-[40%]">
          {source}
        </span>
        <span className="text-sm leading-none">{arrow}</span>
        <span className="font-mono text-[10px] opacity-90 truncate max-w-[40%]">
          {target}
        </span>
        {count != null && count > 1 && (
          <span className="ml-auto rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
            {count} files
          </span>
        )}
      </div>
    </div>
  );
}
