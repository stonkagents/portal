/**
 * Purpose: Full activity timeline page — agent transparency layer.
 *          Shows everything the agent did (silent, digest) alongside
 *          items needing human attention (nudge, alert).
 *          "Don't hide things, just don't interrupt."
 */
'use client';

import { useState, useMemo } from 'react';
import { Icon } from '@/components/ui';
import { ActivityTimeline } from '@/components/features/activity/ActivityTimeline';
import { ActivityFilters } from '@/components/features/activity/ActivityFilters';
import type { FilterState } from '@/components/features/activity/ActivityFilters';
import { useEvents } from '@/providers/EventProvider';
import { filterEvents, sortEventsByTime } from '@/lib/api/hooks/use-events';

const INITIAL_FILTERS: FilterState = {
  category: 'all',
  triage: 'all',
  showSilent: false,
  search: '',
};

export default function ActivityPage() {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const { events } = useEvents();

  const sorted = useMemo(() => sortEventsByTime(events), [events]);
  const filtered = useMemo(() => filterEvents(sorted, filters), [sorted, filters]);
  const now = useMemo(() => new Date().toISOString(), []);

  const alertCount = events.filter(e => e.triage === 'alert').length;
  const nudgeCount = events.filter(e => e.triage === 'nudge').length;
  const agentHandledCount = events.filter(e => e.triage === 'silent' || e.triage === 'digest').length;

  return (
    <div className="flex-1 min-w-0 p-4 flex flex-col gap-4 max-w-[1100px] mx-auto w-full" data-testid="activity-page">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          <Icon name="activity" /> Activity
        </h1>
        <p className="text-sm text-text-secondary mt-1">Everything your agent did, with full transparency into autonomous actions</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3" data-testid="activity-stats">
        <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center hover:shadow-[0_0_20px_rgba(255,77,77,0.08)] transition-shadow">
          <div className="flex justify-center mb-1">
            <span className="w-2 h-2 rounded-full bg-accent-red" />
          </div>
          <div className="text-2xl font-bold text-accent-red leading-tight" data-testid="stat-alerts">
            {alertCount}
          </div>
          <div className="text-[11px] text-text-secondary uppercase tracking-wider mt-1">Alerts</div>
        </div>

        <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center hover:shadow-[0_0_20px_rgba(0,255,0,0.08)] transition-shadow">
          <div className="flex justify-center mb-1">
            <span className="w-2 h-2 rounded-full bg-accent-green" />
          </div>
          <div className="text-2xl font-bold text-accent-green leading-tight" data-testid="stat-nudges">
            {nudgeCount}
          </div>
          <div className="text-[11px] text-text-secondary uppercase tracking-wider mt-1">Nudges</div>
        </div>

        <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center hover:shadow-[0_0_20px_rgba(179,136,255,0.08)] transition-shadow">
          <div className="flex justify-center mb-1">
            <span className="w-2 h-2 rounded-full bg-accent-purple" />
          </div>
          <div className="text-2xl font-bold text-accent-purple leading-tight" data-testid="stat-agent-handled">
            {agentHandledCount}
          </div>
          <div className="text-[11px] text-text-secondary uppercase tracking-wider mt-1">Agent Handled</div>
        </div>
      </div>

      {/* Showing count */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filters + Timeline */}
      <div className="bg-bg-secondary border border-border-default rounded-lg overflow-hidden">
        <ActivityFilters filters={filters} onChange={setFilters} />
        <ActivityTimeline events={filtered} now={now} />
      </div>
    </div>
  );
}
