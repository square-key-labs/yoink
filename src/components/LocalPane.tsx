import { readDir } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import type { FileEntry } from "../lib/api";
import { FileTable } from "./FileTable";
import { PathBar } from "./PathBar";

export function LocalPane() {
  const [path, setPath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(target: string) {
    setLoading(true);
    try {
      const items = await readDir(target);
      const mapped: FileEntry[] = items.map((e) => {
        const kind = e.isDirectory
          ? "dir"
          : e.isSymlink
            ? "symlink"
            : e.isFile
              ? "file"
              : "other";
        const full = `${target.replace(/\/$/, "")}/${e.name}`;
        return {
          name: e.name,
          path: full,
          kind,
          size: 0,
          modified_unix: null,
          permissions: null,
        } as FileEntry;
      });
      setEntries(mapped);
      setPath(target);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    homeDir().then(load).catch(() => setLoading(false));
  }, []);

  function onOpen(entry: FileEntry) {
    if (entry.kind === "dir") load(entry.path);
  }
  function onUp() {
    const next = path.replace(/\/[^/]+\/?$/, "") || "/";
    load(next);
  }

  return (
    <div className="flex flex-col min-w-0 flex-1 border-r border-black/5 dark:border-white/5">
      <div className="h-6 shrink-0 px-3 flex items-center text-[10px] uppercase tracking-wider text-neutral-500">
        Local · {path || "…"}
      </div>
      <PathBar path={path} onNavigate={load} onUp={onUp} onRefresh={() => load(path)} />
      <FileTable entries={entries} onOpen={onOpen} loading={loading} />
    </div>
  );
}
