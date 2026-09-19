/**
 * Purpose: Tests for the refactored NotificationBell — shows only agent-curated
 *          alerts (nudge + alert), no tabs, with "View all activity" link.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDateTime } from '@/lib/utils/format';
import { NotificationBell } from '../NotificationBell';
import type { ClawEvent } from '@/lib/types/claw-event';
import type { BoardActivityItem } from '@/lib/types/community';

const events: ClawEvent[] = [
  {
    id: 'e1',
    timestamp: '2026-02-08T14:00:00.000Z',
    source: 'daemon',
    category: 'security',
    triage: 'alert',
    title: 'Blocked peer',
    description: 'Auto-blocked.',
    read: false,
    dismissed: false,
    actions: [{ label: 'View', type: 'link', href: '/peers', variant: 'primary' }],
  },
  {
    id: 'e2',
    timestamp: '2026-02-08T13:00:00.000Z',
    source: 'daemon',
    category: 'sync',
    triage: 'nudge',
    title: 'Sync done',
    description: 'config.zip from @AgentMax.',
    read: false,
    dismissed: false,
  },
  {
    id: 'e3',
    timestamp: '2026-02-08T12:00:00.000Z',
    source: 'daemon',
    category: 'peer',
    triage: 'silent',
    title: 'Peer joined',
    description: 'DataDave.',
    read: true,
    dismissed: false,
  },
];

describe('NotificationBell', () => {
  it('renders the bell button', () => {
    render(<NotificationBell events={events} />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('shows unread count badge for nudge + alert events only', () => {
    render(<NotificationBell events={events} />);
    // e1 (alert, unread) + e2 (nudge, unread) = 2; e3 (silent) excluded
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('2');
  });

  it('hides badge when no unread alerts/nudges', () => {
    const allRead = events.map(e => ({ ...e, read: true }));
    render(<NotificationBell events={allRead} />);
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('opens the panel when bell is clicked', () => {
    render(<NotificationBell events={events} />);
    // The panel is a popover: absent until the bell is clicked.
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();
  });

  it('shows only nudge and alert events in the panel (not silent)', () => {
    render(<NotificationBell events={events} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Blocked peer')).toBeInTheDocument();
    expect(screen.getByText('Sync done')).toBeInTheDocument();
    expect(screen.queryByText('Peer joined')).not.toBeInTheDocument();
  });

  it('shows "View all activity" link in the panel', () => {
    render(<NotificationBell events={events} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-view-all')).toBeInTheDocument();
  });

  it('closes the panel on Escape and on a click outside', () => {
    render(<NotificationBell events={events} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('calls onMarkAllRead when mark-all button is clicked', () => {
    const onMarkAllRead = vi.fn();
    render(<NotificationBell events={events} onMarkAllRead={onMarkAllRead} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('notification-mark-all'));
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  // The popover redesign dropped per-event action links; the event model still
  // carries them. Restore this once the popover renders actions again.
  it.todo('renders the primary action link on events that have actions');

  it('does not render action button when event has no actions', () => {
    render(<NotificationBell events={events} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    // e2 has no actions
    expect(screen.queryByTestId('notif-action-e2')).not.toBeInTheDocument();
  });

  it('shows empty state when no alerts/nudges exist', () => {
    const silentOnly = events.filter(e => e.triage === 'silent');
    render(<NotificationBell events={silentOnly} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-empty')).toBeInTheDocument();
  });
});

describe('NotificationBell board activity', () => {
  const activity: BoardActivityItem[] = [
    {
      id: 'a2',
      kind: 'bounty_awarded',
      postId: 'p2',
      postTitle: 'Benchmarks wanted',
      replyId: 'r2',
      actorPeerId: '12D3KooWactor2abcdefghijklmnopqrstuvwxyz0123456789',
      actorDisplayName: 'Alice',
      actorReputationTier: 'trusted',
      amount: 200,
      createdAt: '2026-09-16T11:00:00Z',
      symbol: null,
      decimals: null,
      roomMint: null,
      readAt: null,
    },
    {
      id: 'a1',
      kind: 'reply_on_post',
      postId: 'p1',
      postTitle: 'Need Q3 data',
      replyId: 'r1',
      actorPeerId: '12D3KooWactor1abcdefghijklmnopqrstuvwxyz0123456789',
      actorDisplayName: null,
      amount: null,
      createdAt: '2026-09-16T10:00:00Z',
      symbol: null,
      decimals: null,
      roomMint: null,
      readAt: '2026-09-16T10:30:00Z',
    },
    {
      id: 'a0',
      kind: 'bounty_expired_refunded',
      postId: 'p0',
      postTitle: '',
      replyId: null,
      actorPeerId: null,
      actorDisplayName: null,
      amount: 50,
      createdAt: '2026-09-15T10:00:00Z',
      symbol: null,
      decimals: null,
      roomMint: null,
      readAt: null,
    },
  ];

  it('counts unread alerts plus unread activity in the badge', () => {
    render(<NotificationBell events={events} activity={activity} activityUnread={2} />);
    // 2 unread alerts/nudges + 2 unread activity rows
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('4');
    expect(screen.getByTestId('notification-bell')).toHaveAttribute('aria-label', 'Notifications (4 unread)');
  });

  it('lists activity newest first with actor, post title link, time and amount', () => {
    render(<NotificationBell events={[]} activity={activity} activityUnread={2} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.queryByTestId('notification-empty')).not.toBeInTheDocument();
    const rows = screen.getAllByTestId(/^activity-item-a\d$/);
    expect(rows.map(r => r.getAttribute('data-testid'))).toEqual(['activity-item-a2', 'activity-item-a1', 'activity-item-a0']);
    expect(rows[0]).toHaveAttribute('href', '/community?post=p2');
    expect(rows[0]).toHaveAttribute('data-unread', 'true');
    expect(rows[1]).not.toHaveAttribute('data-unread');
    expect(screen.getByTestId('activity-item-a2-actor')).toHaveTextContent('Alice');
    // The actor is its own link, to that agent's activity, beside the row's link into the thread, never inside it
    const actor = screen.getByTestId('activity-item-a2-actor');
    expect(actor.tagName).toBe('A');
    expect(actor).toHaveAttribute('href', '/community?agent=12D3KooWactor2abcdefghijklmnopqrstuvwxyz0123456789');
    expect(actor.closest('a')).toBe(actor);
    expect(rows[0].querySelectorAll('a')).toHaveLength(0);
    expect(screen.getByTestId('activity-item-a2-actor-tier')).toHaveTextContent('Trusted');
    expect(screen.queryByTestId('activity-item-a1-actor-tier')).toBeNull();
    expect(screen.getByTestId('activity-item-a1-actor')).toHaveTextContent('12D3KooWactor1ab...6789');
    expect(screen.getByTestId('activity-item-a2-post')).toHaveTextContent('Benchmarks wanted');
    expect(screen.getByTestId('activity-item-a2-amount')).toHaveTextContent('200 credits');
    expect(screen.queryByTestId('activity-item-a1-amount')).not.toBeInTheDocument();
    // The tracker's own notice names no actor and falls back for a missing title
    expect(screen.queryByTestId('activity-item-a0-actor')).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-item-a0-post')).toHaveTextContent('Untitled post');
    expect(screen.getByTestId('activity-item-a0-amount')).toHaveTextContent('50 credits');
    expect(screen.getByTestId('notification-activity-unread')).toHaveTextContent('2');
  });

  it('marks a row read on click and closes; a read row is left alone', () => {
    const onActivityRead = vi.fn();
    render(<NotificationBell events={[]} activity={activity} activityUnread={2} onActivityRead={onActivityRead} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('activity-item-a1'));
    expect(onActivityRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('activity-item-a2'));
    expect(onActivityRead).toHaveBeenCalledWith('a2');
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('marks a row read and closes when its actor name is followed too', () => {
    const onActivityRead = vi.fn();
    render(<NotificationBell events={[]} activity={activity} activityUnread={2} onActivityRead={onActivityRead} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('activity-item-a2-actor'));
    expect(onActivityRead).toHaveBeenCalledWith('a2');
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('lists every fetched row, not just the first eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...activity[0], id: `m${i}`, postId: `p${i}` }));
    render(<NotificationBell events={[]} activity={many} activityUnread={12} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getAllByTestId(/^activity-item-m\d+$/)).toHaveLength(12);
  });

  it('offers Mark all read with activity alone, and keeps the suggestions nudge where it was', () => {
    const onMarkAllRead = vi.fn();
    const suggestions: ClawEvent = {
      ...events[1],
      id: 'autopilot-suggestions-s1',
      category: 'agent',
      title: 'Your agent has 1 suggested reply',
      actions: [{ label: 'Review', type: 'link', href: '/community', variant: 'primary' }],
    };
    render(<NotificationBell events={[suggestions]} activity={activity} activityUnread={2} onMarkAllRead={onMarkAllRead} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notif-item-autopilot-suggestions-s1')).toHaveTextContent('Your agent has 1 suggested reply');
    fireEvent.click(screen.getByTestId('notification-mark-all'));
    expect(onMarkAllRead).toHaveBeenCalled();
  });
});

describe('NotificationBell routed requests (phase 2)', () => {
  it('renders a routed request as one the owner could answer, with its bounty, linking to the thread', () => {
    const routed: BoardActivityItem = {
      id: 'a9',
      kind: 'request_routed',
      postId: 'p9',
      postTitle: 'Need the Q3 earnings set',
      replyId: null,
      actorPeerId: 'peer-author',
      actorDisplayName: 'Alice',
      amount: 150,
      symbol: null,
      decimals: null,
      roomMint: null,
      createdAt: '2026-09-16T12:00:00Z',
      readAt: null,
    };
    render(<NotificationBell events={[]} activity={[routed]} activityUnread={1} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('activity-item-a9')).toHaveAttribute('href', '/community?post=p9');
    const row = screen.getByTestId('activity-row-a9');
    expect(row).toHaveTextContent('A request you could answer: Need the Q3 earnings set');
    expect(screen.queryByTestId('activity-item-a9-actor')).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-item-a9-amount')).toHaveTextContent('150 credits');
  });

  it('links into the room when the post is in one', () => {
    const inRoom: BoardActivityItem = {
      id: 'a10',
      kind: 'request_routed',
      postId: 'p10',
      postTitle: 'Room request',
      replyId: null,
      actorPeerId: null,
      actorDisplayName: null,
      amount: null,
      symbol: null,
      decimals: null,
      roomMint: 'Mint111',
      createdAt: '2026-09-16T12:00:00Z',
      readAt: null,
    };
    render(<NotificationBell events={[]} activity={[inRoom]} activityUnread={1} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('activity-item-a10')).toHaveAttribute('href', '/community?room=Mint111&post=p10');
  });
});

describe('NotificationBell bounty negotiation (phase 3)', () => {
  const base: Omit<BoardActivityItem, 'id' | 'kind' | 'amount' | 'actorPeerId' | 'actorDisplayName'> = {
    postId: 'p11',
    postTitle: 'Need the Q3 earnings set',
    replyId: 'r11',
    symbol: null,
    decimals: null,
    roomMint: null,
    createdAt: '2026-09-16T12:00:00Z',
    readAt: null,
  };

  it('says who asks how many credits, with the amount in the sentence only', () => {
    const ask: BoardActivityItem = { ...base, id: 'a11', kind: 'bounty_ask', amount: 60, actorPeerId: 'peer-bob', actorDisplayName: 'Bob' };
    render(<NotificationBell events={[]} activity={[ask]} activityUnread={1} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const row = screen.getByTestId('activity-row-a11');
    expect(row).toHaveTextContent('Bob asks 60 credits for: Need the Q3 earnings set');
    expect(screen.getByTestId('activity-item-a11')).toHaveAttribute('href', '/community?post=p11');
    expect(screen.queryByTestId('activity-item-a11-amount')).not.toBeInTheDocument();
  });

  it('says the bounty was raised without naming an actor', () => {
    const raised: BoardActivityItem = { ...base, id: 'a12', kind: 'bounty_raised', amount: 1500, actorPeerId: 'peer-author', actorDisplayName: 'Alice' };
    render(<NotificationBell events={[]} activity={[raised]} activityUnread={1} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const row = screen.getByTestId('activity-row-a12');
    expect(row).toHaveTextContent('Bounty raised to 1,500 on: Need the Q3 earnings set');
    expect(screen.queryByTestId('activity-item-a12-actor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-item-a12-amount')).not.toBeInTheDocument();
  });
});

describe('NotificationBell relative time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function withAges(now: number): ClawEvent[] {
    return [
      { ...events[0], id: 'fresh', timestamp: new Date(now - 30_000).toISOString() },
      { ...events[1], id: 'old', timestamp: new Date(now - 2 * 60_000).toISOString() },
      { ...events[1], id: 'older', timestamp: new Date(now - 5 * 86_400_000).toISOString() },
    ];
  }

  it('labels every alert with how long ago it happened and the full date and time on hover', () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-09-17T12:00:00Z');
    vi.setSystemTime(now);
    const aged = withAges(now);
    render(<NotificationBell events={aged} />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    expect(screen.getByTestId('notif-time-fresh')).toHaveTextContent('just now');
    expect(screen.getByTestId('notif-time-old')).toHaveTextContent('2m ago');
    expect(screen.getByTestId('notif-time-older')).toHaveTextContent('5d ago');
    expect(screen.getByTestId('notif-time-old')).toHaveAttribute('title', formatDateTime(aged[1].timestamp));
    expect(screen.getByTestId('notif-time-old')).toHaveAttribute('dateTime', aged[1].timestamp);
  });

  it('keeps the labels moving while the panel stays open', () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-09-17T12:00:00Z');
    vi.setSystemTime(now);
    render(<NotificationBell events={withAges(now)} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notif-time-fresh')).toHaveTextContent('just now');

    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(screen.getByTestId('notif-time-fresh')).toHaveTextContent('2m ago');
    expect(screen.getByTestId('notif-time-old')).toHaveTextContent('4m ago');
  });

  it('reads the clock afresh each time the panel opens', () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-09-17T12:00:00Z');
    vi.setSystemTime(now);
    render(<NotificationBell events={withAges(now)} />);
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notif-time-old')).toHaveTextContent('12m ago');
  });
});
