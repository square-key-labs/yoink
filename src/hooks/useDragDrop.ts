import { useEffect, useState } from "react";
import { useDragState } from "../store/dragState";

export type DragDropPhase = "idle" | "over" | "drop";

export interface DragDropState {
  phase: DragDropPhase;
  position: { x: number; y: number } | null;
  paths: string[];
}

function urisToPaths(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => {
      if (!l.startsWith("file://")) return l;
      try {
        return decodeURIComponent(new URL(l).pathname);
      } catch {
        return l;
      }
    });
}

function extractPathsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  // Preferred: Finder supplies text/uri-list with file:// URLs
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    const out = urisToPaths(uriList);
    if (out.length) return out;
  }
  const plain = dt.getData("text/plain");
  if (plain) {
    const out = urisToPaths(plain);
    if (out.length) return out;
  }
  // Fallback: File objects; some Tauri builds expose `.path`
  const files = dt.files;
  if (files && files.length) {
    const paths: string[] = [];
    for (const f of Array.from(files)) {
      const p = (f as unknown as { path?: string }).path;
      if (p) paths.push(p);
    }
    if (paths.length) return paths;
  }
  return [];
}

export function useDragDrop(onDrop: (paths: string[], pos: { x: number; y: number }) => void) {
  const [state, setState] = useState<DragDropState>({
    phase: "idle",
    position: null,
    paths: [],
  });

  useEffect(() => {
    function hasFileTypes(dt: DataTransfer | null): boolean {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return (
        types.includes("Files") ||
        types.includes("text/uri-list") ||
        types.includes("application/x-moz-file")
      );
    }

    function onDragEnter(e: DragEvent) {
      if (useDragState.getState().intraActive) return;
      if (!hasFileTypes(e.dataTransfer)) return;
      e.preventDefault();
      setState((s) => ({
        ...s,
        phase: "over",
        position: { x: e.clientX, y: e.clientY },
      }));
    }

    function onDragOver(e: DragEvent) {
      if (useDragState.getState().intraActive) return;
      if (!hasFileTypes(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(e: DragEvent) {
      if (useDragState.getState().intraActive) return;
      if (e.clientX === 0 && e.clientY === 0) {
        // Leaving the window entirely
        setState({ phase: "idle", position: null, paths: [] });
      }
    }

    function onDocDrop(e: DragEvent) {
      if (useDragState.getState().intraActive) return;
      if (!hasFileTypes(e.dataTransfer)) return;
      e.preventDefault();
      const paths = extractPathsFromDataTransfer(e.dataTransfer);
      // eslint-disable-next-line no-console
      console.log(
        "[yoink drag-drop]",
        "types=",
        Array.from(e.dataTransfer?.types || []),
        "paths=",
        paths,
      );
      setState({ phase: "idle", position: null, paths: [] });
      if (paths.length) onDrop(paths, { x: e.clientX, y: e.clientY });
    }

    document.addEventListener("dragenter", onDragEnter, true);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragleave", onDragLeave, true);
    document.addEventListener("drop", onDocDrop, true);
    return () => {
      document.removeEventListener("dragenter", onDragEnter, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("dragleave", onDragLeave, true);
      document.removeEventListener("drop", onDocDrop, true);
    };
  }, [onDrop]);

  return state;
}
