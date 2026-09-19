/**
 * TabBar — horizontal tab navigation with optional count badges
 *   Active tab: green text, green bottom-border-2px, green bg-alpha-08, rounded-t
 *   Count badge: xs padding, sm rounded, bg white/6% or green/15% when active
 */
'use client';

import { cn } from '@/lib/utils/cn';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  return (
    <div
      className={cn('flex gap-1 overflow-x-auto border-b border-border-default scrollbar-none mb-4', className)}
      role="tablist"
      data-testid="tab-bar"
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            data-testid={`tab-${tab.id}`}
            className={cn(
              'flex items-center gap-2 shrink-0 px-3 py-2.5 min-h-[44px]',
              'text-sm font-semibold font-mono whitespace-nowrap',
              'border-b-2 border-transparent transition-all cursor-pointer',
              'bg-transparent border-t-0 border-l-0 border-r-0',
              'hover:text-text-primary',
              isActive ? 'text-accent-green bg-accent-green/[0.08] border-b-accent-green rounded-t' : 'text-text-secondary',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  isActive ? 'bg-accent-green/15 text-accent-green' : 'bg-white/6 text-text-tertiary',
                )}
              >
                {typeof tab.count === 'number' ? tab.count.toLocaleString() : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
