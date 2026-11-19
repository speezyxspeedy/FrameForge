import React, { useState } from 'react';
import {
  Check,
  Download,
  HelpCircle,
  Menu,
  Moon,
  Pencil,
  Sun,
  Upload,
} from 'lucide-react';

interface TopToolbarProps {
  workspaceName: string;
  onRenameWorkspace: (name: string) => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenHelp: () => void;
  onOpenMobileNav: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  workspaceName,
  onRenameWorkspace,
  onOpenImport,
  onOpenExport,
  theme,
  onToggleTheme,
  onOpenHelp,
  onOpenMobileNav,
}) => {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(workspaceName);

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed) {
      onRenameWorkspace(trimmed);
    } else {
      setDraftName(workspaceName);
    }
    setEditing(false);
  };

  return (
    <header className="h-12 shrink-0 flex items-center justify-between gap-4 px-3 sm:px-4 bg-white dark:bg-[#0D131F] border-b border-slate-200 dark:border-slate-800/90">
      {/* Left: Mobile menu + FrameForge Logo + Active Workspace Name */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect
              x="2"
              y="3"
              width="20"
              height="18"
              rx="3"
              className="stroke-cyan-600 dark:stroke-cyan-400"
              strokeWidth="1.75"
            />
            <path
              d="M7 8h4M7 12h10M7 16h6"
              className="stroke-blue-600 dark:stroke-blue-400"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <rect
              x="14"
              y="6.75"
              width="3.2"
              height="2.5"
              rx="0.5"
              className="fill-cyan-600 dark:fill-cyan-400"
            />
          </svg>
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            FrameForge
          </span>
        </div>

        <span
          className="hidden sm:inline text-slate-300 dark:text-slate-700 select-none"
          aria-hidden="true"
        >
          /
        </span>

        {editing ? (
          <div className="flex items-center gap-1 min-w-0">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  setDraftName(workspaceName);
                  setEditing(false);
                }
              }}
              autoFocus
              aria-label="Workspace schema name"
              className="h-7 px-2 text-xs font-medium bg-slate-100 dark:bg-slate-900 border border-cyan-500 rounded text-slate-900 dark:text-slate-100 focus:outline-none w-44 sm:w-56"
            />
            <button
              type="button"
              onClick={commitName}
              aria-label="Save workspace name"
              className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(workspaceName);
              setEditing(true);
            }}
            title="Click to rename active protocol schema"
            className="hidden sm:flex items-center gap-1.5 min-w-0 max-w-[240px] md:max-w-[320px] px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors group"
          >
            <span className="truncate">{workspaceName}</span>
            <Pencil className="w-3 h-3 shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Right: Compact Engineering Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          <span>Import</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-1" aria-hidden="true" />

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenHelp}
          title="Help & quick reference"
          aria-label="Help and quick reference"
          className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
