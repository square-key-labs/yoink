export function DropOverlay({
  visible,
  canDrop,
  label,
}: {
  visible: boolean;
  canDrop: boolean;
  label: string;
}) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div
        className={
          "mx-6 my-4 flex-1 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors " +
          (canDrop
            ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
            : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300")
        }
      >
        <div className="text-sm font-medium">{label}</div>
      </div>
    </div>
  );
}
