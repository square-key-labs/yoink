import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect } from "react";

export interface DragDropEvent {
  paths: string[];
  position: { x: number; y: number };
}

export function useDragDrop(handler: (e: DragDropEvent) => void) {
  useEffect(() => {
    const w = getCurrentWebviewWindow();
    const unlisten = w.onDragDropEvent((evt) => {
      if (evt.payload.type === "drop") {
        handler({
          paths: evt.payload.paths,
          position: evt.payload.position,
        });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handler]);
}
