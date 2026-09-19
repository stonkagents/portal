/**
 * Purpose: Tests for /activity page — renders stats, filters, and timeline
 *          composing existing ActivityFilters + ActivityTimeline components.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ClawEvent } from '@/lib/types/claw-event';

const TEST_EVENTS: ClawEvent[] = [
  {
    id: 'e1',
    timestamp: '2026-02-08T14:00:00.000Z',
    source: 'daemon',
    category: 'security',
    triage: 'alert',
    title: 'Blocked malicious peer',
    description: 'Auto-blocked peer X.',
    agentAction: 'auto-blocked',
    read: false,
    dismissed: false,
  },
  {
    id: 'e2',
    timestamp: '2026-02-08T13:00:00.000Z',
    source: 'daemon',
    category: 'sync',
    triage: 'nudge',
    title: 'Sync complete',
    description: '2.3 MB from @AgentMax.',
    read: false,
    dismissed: false,
  },
  {
    id: 'e3',
    timestamp: '2026-02-08T12:00:00.000Z',
    source: 'daemon',
    category: 'peer',
    triage: 'silent',
    title: 'Peer connected',
    description: 'DataDave joined.',
    agentAction: 'logged',
    read: true,
    dismissed: false,
  },
  {
    id: 'e4',
    timestamp: '2026-02-08T11:00:00.000Z',
    source: 'agent',
    category: 'agent',
    triage: 'digest',
    title: 'Batch syncs',
    description: '3 background syncs.',
    agentAction: 'batched',
    read: true,
    dismissed: false,
  },
  {
    id: 'e5',
    timestamp: '2026-02-08T10:00:00.000Z',
    source: 'daemon',
    category: 'credit',
    triage: 'silent',
    title: 'Credit earned',
    description: '2 credits from sync.',
    agentAction: 'logged',
    read: true,
    dismissed: false,
  },
];

// Mock EventProvider — ActivityPage now uses useEvents() instead of MOCK_EVENTS
vi.mock('@/providers/EventProvider', () => ({
  useEvents: () => ({
    events: TEST_EVENTS,
    alertCount: 1,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    dismiss: vi.fn(),
    addEvent: vi.fn(),
    preferences: { preset: 'balanced' as const, overrides: {} },
    updatePreferences: vi.fn(),
  }),
}));

import ActivityPage from '../../activity/page';

describe('ActivityPage', () => {
  it('renders the page with data-testid', () => {
    render(<ActivityPage />);
    expect(screen.getByTestId('activity-page')).toBeInTheDocument();
  });

  it('renders the page title', () => {
    render(<ActivityPage />);
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('renders stats cards', () => {
    render(<ActivityPage />);
    expect(screen.getByTestId('activity-stats')).toBeInTheDocument();
  });

  it('shows alert count in stats', () => {
    render(<ActivityPage />);
    // 1 alert event (e1)
    expect(screen.getByTestId('stat-alerts')).toHaveTextContent('1');
  });

  it('shows nudge count in stats', () => {
    render(<ActivityPage />);
    // 1 nudge event (e2)
    expect(screen.getByTestId('stat-nudges')).toHaveTextContent('1');
  });

  it('shows agent-handled count in stats', () => {
    render(<ActivityPage />);
    // 3 silent/digest events (e3, e4, e5)
    expect(screen.getByTestId('stat-agent-handled')).toHaveTextContent('3');
  });

  it('renders the filter bar', () => {
    render(<ActivityPage />);
    expect(screen.getByTestId('activity-filters')).toBeInTheDocument();
  });

  it('renders the timeline', () => {
    render(<ActivityPage />);
    expect(screen.getByTestId('activity-timeline')).toBeInTheDocument();
  });

  it('hides silent events by default (showSilent starts false)', () => {
    render(<ActivityPage />);
    // e3 and e5 are silent — should NOT appear by default
    expect(screen.queryByTestId('activity-item-e3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-item-e5')).not.toBeInTheDocument();
    // e1, e2, e4 should appear (alert, nudge, digest)
    expect(screen.getByTestId('activity-item-e1')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e2')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e4')).toBeInTheDocument();
  });

  it('shows silent events when toggle is checked', () => {
    render(<ActivityPage />);
    const toggle = screen.getByTestId('activity-toggle-silent-checkbox');
    fireEvent.click(toggle);
    // Now all 5 events should appear
    expect(screen.getByTestId('activity-item-e3')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e5')).toBeInTheDocument();
  });

  it('filters by search text', () => {
    render(<ActivityPage />);
    const searchInput = screen.getByTestId('activity-search');
    fireEvent.change(searchInput, { target: { value: 'malicious' } });
    // Only e1 matches "malicious"
    expect(screen.getByTestId('activity-item-e1')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-item-e2')).not.toBeInTheDocument();
  });

  it('filters by category', () => {
    render(<ActivityPage />);
    const select = screen.getByTestId('activity-filter-category');
    fireEvent.change(select, { target: { value: 'security' } });
    expect(screen.getByTestId('activity-item-e1')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-item-e2')).not.toBeInTheDocument();
  });
});
