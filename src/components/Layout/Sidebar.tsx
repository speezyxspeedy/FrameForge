import React from 'react';
import {
  Binary,
  BookOpen,
  Cpu,
  FileCode2,
  Layers,
  LayoutPanelLeft,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { NavigationView } from '../../types/protocol';

interface SidebarProps {
  activeView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  fieldCount: number;
  packetByteLength: number;
  errorCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavigationView;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Integrated multi-pane workbench',
    icon: LayoutPanelLeft,
  },
  {
    id: 'builder',
    label: 'Packet Builder',
    description: 'Schema, types, offsets & round-trip',
    icon: Layers,
  },
  {
    id: 'hex',
    label: 'Hex Inspector',
    description: 'Offset, hex, ASCII & bit editor',
    icon: Binary,
  },
  {
    id: 'decoder',
    label: 'Decoder',
    description: 'Parse hex frames against schema',
    icon: Cpu,
  },
  {
    id: 'checksum',
    label: 'Checksum Lab',
    description: 'XOR-8, CRC-8, CRC-16, CRC-32',
    icon: ShieldCheck,
  },
  {
    id: 'templates',
    label: 'Protocol Templates',
    description: 'Built-in & saved binary schemas',
    icon: FileCode2,
  },
  {
    id: 'docs',
    label: 'Documentation',
    description: 'Binary engineering reference',
    icon: BookOpen,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  fieldCount,
  packetByteLength,
  errorCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-[#0E1420] border-r border-slate-200 dark:border-slate-800/90 select-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 md:hidden">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Navigation
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                active
                  ? 'bg-cyan-500/12 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-tight truncate">
                  {item.label}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800/90 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <div className="flex items-center justify-between font-mono tabular-nums">
          <span>Active Frame</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium">
            {packetByteLength} B
          </span>
        </div>
        <div className="flex items-center justify-between font-mono tabular-nums">
          <span>Schema Fields</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium">
            {fieldCount}
          </span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center justify-between font-mono tabular-nums text-red-600 dark:text-red-400 pt-0.5">
            <span>Validation Errors</span>
            <span className="font-semibold">{errorCount}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-56 xl:w-60 shrink-0 h-full">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full shadow-2xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
