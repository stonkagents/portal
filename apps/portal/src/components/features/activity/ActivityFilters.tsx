/**
 * Purpose: Filter bar for the Activity page — category dropdown,
 *          search input, and show-agent-handled toggle.
 */
'use client';

import { EVENT_CATEGORIES, CATEGORY_META } from '@/lib/types/claw-event';
import type { EventCategory, EventTriage } from '@/lib/types/claw-event';

export interface FilterState {
  category: EventCategory | 'all';
  triage: EventTriage | 'all';
  showSilent: boolean;
  search: string;
}

interface ActivityFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function ActivityFilters({ filters, onChange }: ActivityFiltersProps) {
  return (
    <div data-testid="activity-filters" className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border-default">
      <input
        data-testid="activity-search"
        type="text"
        placeholder="Search events..."
        value={filters.search}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        className="flex-1 min-w-[160px] h-9 px-3 bg-bg-input border border-border-default rounded text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-green focus:outline-none"
      />

      <select
        data-testid="activity-filter-category"
        value={filters.category}
        onChange={e => onChange({ ...filters, category: e.target.value as EventCategory | 'all' })}
        className="h-9 px-3 bg-bg-input border border-border-default rounded text-sm text-text-primary focus:border-accent-green focus:outline-none"
      >
        <option value="all">All categories</option>
        {EVENT_CATEGORIES.map(cat => (
          <option key={cat} value={cat}>{CATEGORY_META[cat].label}</option>
        ))}
      </select>

      <label
        data-testid="activity-toggle-silent"
        className="flex min-h-[44px] items-center gap-2 cursor-pointer select-none text-sm text-text-secondary"
      >
        <input
          data-testid="activity-toggle-silent-checkbox"
          type="checkbox"
          checked={filters.showSilent}
          onChange={() => onChange({ ...filters, showSilent: !filters.showSilent })}
          className="w-4 h-4 accent-accent-green"
        />
        Show agent-handled
      </label>
    </div>
  );
}
