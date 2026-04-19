import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const w = getCurrentWindow();
    let active = true;
    async function check() {
      try {
        const fs = await w.isFullscreen();
        if (active) setFullscreen(fs);
      } catch {}
    }
    check();
    const unlisten = w.onResized(() => check());
    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, []);
  return fullscreen;
}
