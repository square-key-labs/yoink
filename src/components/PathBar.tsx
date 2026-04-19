import { useEffect, useRef } from "react";
import { useViewPrefs } from "../store/viewPrefs";
import {
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  RotateCw,
  Search,
  X,
} from "./icons";

export function PathBar({
  path,
  onNavigate,
  onUp,
  onRefresh,
  searchOpen = false,
  searchValue = "",
  onSearchChange,
  onToggleSearch,
  onCloseSearch,
}: {
  path: string;
  onNavigate: (p: string) => void;
  onUp: () => void;
  onRefresh: () => void;
  searchOpen?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onToggleSearch?: () => void;
  onCloseSearch?: () => void;
}) {
  const parts = path.split("/").filter(Boolean);
  const showHidden = useViewPrefs((s) => s.showHidden);
  const toggleShowHidden = useViewPrefs((s) => s.toggleShowHidden);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      // focus after mount
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchOpen]);

  return (
    <div className="flex h-8 items-center gap-1 px-2 border-b border-hairline surface-2">
      <button
        onClick={onUp}
        title="Parent directory"
        className="rounded p-1 hover-soft"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onRefresh}
        title="Refresh"
        className="rounded p-1 hover-soft"
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={toggleShowHidden}
        title={showHidden ? "Hide dotfiles" : "Show dotfiles"}
        className="rounded p-1 hover-soft"
      >
        {showHidden ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </button>
      {onToggleSearch && (
        <button
          onClick={onToggleSearch}
          title="Search (⌘F)"
          className={
            "rounded p-1 hover-soft " +
            (searchOpen ? "text-[rgb(var(--accent))]" : "")
          }
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      )}
      {searchOpen && onSearchChange && onCloseSearch ? (
        <div className="flex items-center flex-1 min-w-0 gap-1">
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCloseSearch();
              }
            }}
            placeholder="Filter in this directory…"
            className="flex-1 min-w-0 h-6 px-2 text-xs rounded bg-transparent border border-hairline focus:outline-none focus:border-[rgb(var(--accent))]"
          />
          <button
            onClick={onCloseSearch}
            title="Close search"
            className="rounded p-1 hover-soft shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 text-xs min-w-0 overflow-hidden">
          <button
            onClick={() => onNavigate("/")}
            className="px-1 rounded hover-soft"
          >
            /
          </button>
          {parts.map((p, i) => {
            const sub = "/" + parts.slice(0, i + 1).join("/");
            return (
              <div key={sub} className="flex items-center">
                <ChevronRight className="h-3 w-3 opacity-50" />
                <button
                  onClick={() => onNavigate(sub)}
                  className="px-1 rounded hover-soft truncate max-w-[180px]"
                >
                  {p}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
