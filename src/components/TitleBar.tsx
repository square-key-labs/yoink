import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFullscreen } from "../hooks/useFullscreen";
import { Plus } from "./icons";

function onDrag(e: React.MouseEvent) {
  if (e.buttons !== 1 || e.detail === 2) return;
  getCurrentWindow().startDragging().catch(() => {});
}

export function TitleBar({ onConnect }: { onConnect: () => void }) {
  const fullscreen = useFullscreen();
  return (
    <div
      onMouseDown={onDrag}
      className={
        "flex h-11 shrink-0 items-center gap-2 pr-3 border-b border-hairline surface-1 transition-[padding] " +
        (fullscreen ? "pl-4" : "pl-24")
      }
    >
      <span className="text-sm font-medium tracking-tight pointer-events-none">
        Yoink
      </span>
      <div className="flex-1" onMouseDown={onDrag} />
      <button
        onClick={onConnect}
        onMouseDown={(e) => e.stopPropagation()}
        className="accent-button flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" />
        Connect
      </button>
    </div>
  );
}
