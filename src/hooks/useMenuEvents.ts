import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export function useMenuEvents(handler: (id: string) => void) {
  useEffect(() => {
    const unlisten = listen<string>("yoink://menu", (e) => handler(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handler]);
}
