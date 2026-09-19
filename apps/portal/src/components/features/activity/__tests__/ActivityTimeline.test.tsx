/**
 * Purpose: Tests for ActivityTimeline — renders time-grouped events with
 *          triage indicators, agent actions, and filtering.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ActivityTimeline } from '../ActivityTimeline';
import type { ClawEvent } from '@/lib/types/claw-event';

const today = '2026-02-08T14:00:00.000Z';
const yesterday = '2026-02-07T10:00:00.000Z';
const earlier = '2026-02-05T08:00:00.000Z';

const events: ClawEvent[] = [
  {
    id: 'e1',
    timestamp: today,
    source: 'daemon',
    category: 'security',
    triage: 'alert',
    title: 'Blocked malicious peer',
    description: 'Auto-blocked peer X.',
    agentAction: 'auto-blocked',
    read: false,
    dismissed: false,
    actions: [
      { label: 'View peer', type: 'link', href: '/peers', variant: 'primary' },
      { label: 'Unblock', type: 'command', command: 'unblock peer-x', variant: 'ghost' },
    ],
  },
  {
    id: 'e2',
    timestamp: today,
    source: 'daemon',
    category: 'sync',
    triage: 'nudge',
    title: 'Sync complete: config.zip',
    description: '2.3 MB from @AgentMax.',
    read: false,
    dismissed: false,
  },
  {
    id: 'e3',
    timestamp: today,
    source: 'daemon',
    category: 'peer',
    triage: 'silent',
    title: 'Peer connected: @DataDave',
    description: 'Joined from 192.168.1.42.',
    agentAction: 'logged',
    read: true,
    dismissed: false,
  },
  {
    id: 'e4',
    timestamp: yesterday,
    source: 'daemon',
    category: 'reputation',
    triage: 'nudge',
    title: 'Reached Silver tier',
    description: 'Clout score: 67.',
    read: true,
    dismissed: false,
  },
  {
    id: 'e5',
    timestamp: earlier,
    source: 'agent',
    category: 'agent',
    triage: 'digest',
    title: '3 background syncs',
    description: 'Batched overnight syncs.',
    agentAction: 'batched',
    read: true,
    dismissed: false,
  },
];

describe('ActivityTimeline', () => {
  it('renders all events', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByTestId('activity-item-e1')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e2')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e3')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e4')).toBeInTheDocument();
    expect(screen.getByTestId('activity-item-e5')).toBeInTheDocument();
  });

  it('shows time group headers', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Earlier')).toBeInTheDocument();
  });

  it('displays event titles', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByText('Blocked malicious peer')).toBeInTheDocument();
    expect(screen.getByText('Sync complete: config.zip')).toBeInTheDocument();
    expect(screen.getByText('Reached Silver tier')).toBeInTheDocument();
  });

  it('shows agent action text when present', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByText(/auto-blocked/)).toBeInTheDocument();
    expect(screen.getByText(/logged/)).toBeInTheDocument();
  });

  it('shows category labels', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Sync')).toBeInTheDocument();
  });

  it('renders empty state when no events', () => {
    render(<ActivityTimeline events={[]} now={today} />);
    expect(screen.getByTestId('activity-empty')).toBeInTheDocument();
  });

  it('has the root data-testid', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByTestId('activity-timeline')).toBeInTheDocument();
  });

  it('renders action buttons for events with actions', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.getByTestId('action-e1-0')).toHaveTextContent('View peer');
    expect(screen.getByTestId('action-e1-1')).toHaveTextContent('Unblock');
  });

  it('does not render action row for events without actions', () => {
    render(<ActivityTimeline events={events} now={today} />);
    expect(screen.queryByTestId('action-e2-0')).not.toBeInTheDocument();
  });

  it('renders primary action as link when href is present', () => {
    render(<ActivityTimeline events={events} now={today} />);
    const link = screen.getByTestId('action-e1-0');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/peers');
  });

  it('renders ghost action as button when command is present', () => {
    render(<ActivityTimeline events={events} now={today} />);
    const btn = screen.getByTestId('action-e1-1');
    expect(btn.tagName).toBe('BUTTON');
  });
});
