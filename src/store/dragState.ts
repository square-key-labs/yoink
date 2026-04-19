import { create } from "zustand";

interface DragState {
  intraActive: boolean;
  setIntraActive: (v: boolean) => void;
}

export const useDragState = create<DragState>((set) => ({
  intraActive: false,
  setIntraActive: (v) => set({ intraActive: v }),
}));

// Global safety net: always clear the intra-drag flag on mouseup / blur.
// Covers cases where an HTML5 onDragEnd never fires (e.g. user drops outside
// the webview).
if (typeof window !== "undefined") {
  const clear = () => {
    if (useDragState.getState().intraActive)
      useDragState.getState().setIntraActive(false);
  };
  window.addEventListener("mouseup", clear);
  window.addEventListener("dragend", clear);
  window.addEventListener("blur", clear);

  // Suppress the webview's native drop handling so Tauri's NSWindow-level
  // drag-drop can resolve the dropped file's true path. Without preventDefault
  // here, the webview intercepts and Tauri sees empty paths.
  window.addEventListener(
    "dragover",
    (e) => {
      e.preventDefault();
    },
    true,
  );
  window.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
    },
    true,
  );
}
