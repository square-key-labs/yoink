import { useEffect, useState } from "react";
import "./App.css";
import { api } from "./lib/api";

function App() {
  const [theme, setTheme] = useState<string>("system");
  const [sessions, setSessions] = useState<string[]>([]);

  useEffect(() => {
    api.getTheme().then(setTheme).catch(() => {});
    api.listSessions().then(setSessions).catch(() => {});
  }, []);

  return (
    <main
      className="h-full w-full flex flex-col items-center justify-center gap-3 bg-transparent text-neutral-900 dark:text-neutral-100"
      data-tauri-drag-region
    >
      <h1 className="text-3xl font-semibold tracking-tight">Yoink</h1>
      <p className="text-sm text-neutral-500">
        Native-feel FTP/SFTP client — scaffold online.
      </p>
      <p className="text-xs text-neutral-400">
        theme: {theme} · sessions: {sessions.length}
      </p>
    </main>
  );
}

export default App;
