/**
 * Purpose: The weekly digest rows of the bell come straight from the daemon's
 *          events list, so they survive a reload; their read state lives in
 *          this browser (a first sight takes every event but the newest as
 *          read); each row opens the digest thread in the token's room; the
 *          badge and Mark all read count them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import type { AutopilotEvent } from '@/lib/types/community';
import { DIGEST_READ_KEY, markDigestsRead, resetDigestReadCache, useDigestRows } from '../use-digest-rows';
import { digestHref } from '../DigestList';
import { NotificationBell } from '../NotificationBell';

const D1: AutopilotEvent = { id: 'd1', kind: 'digest_posted', postId: 'p1', mint: 'Mint111', symbol: 'QRM', title: 'QRM weekly digest, Sep 9 to Sep 16', createdAt: '2026-09-16T12:29:00Z' };
const D0: AutopilotEvent = { ...D1, id: 'd0', postId: 'p0', title: 'QRM weekly digest, Sep 2 to Sep 9', createdAt: '2026-09-09T12:29:00Z' };

describe('useDigestRows', () => {
  beforeEach(() => {
    window.localStorage.removeItem(DIGEST_READ_KEY);
    resetDigestReadCache();
  });

  it('takes every event but the newest as read on first sight, and remembers that', () => {
    const { result } = renderHook(() => useDigestRows([D1, D0]));
    expect(result.current.rows.map(r => [r.id, r.read])).toEqual([
      ['d1', false],
      ['d0', true],
    ]);
    expect(result.current.unread).toBe(1);
    expect(JSON.parse(window.localStorage.getItem(DIGEST_READ_KEY) ?? '[]')).toEqual(['d0']);
  });

  it('marks a row read, keeps it read across a fresh mount, and marks all', () => {
    const { result, unmount } = renderHook(() => useDigestRows([D1, D0]));
    act(() => result.current.markRead('d1'));
    expect(result.current.unread).toBe(0);
    unmount();
    resetDigestReadCache();
    const again = renderHook(() => useDigestRows([{ ...D1, id: 'd2', createdAt: '2026-09-23T12:29:00Z' }, D1, D0]));
    expect(again.result.current.rows.map(r => r.read)).toEqual([false, true, true]);
    act(() => again.result.current.markAllRead());
    expect(again.result.current.unread).toBe(0);
    expect(JSON.parse(window.localStorage.getItem(DIGEST_READ_KEY) ?? '[]')).toEqual(expect.arrayContaining(['d0', 'd1', 'd2']));
  });

  it('is empty without events and ignores other kinds', () => {
    expect(renderHook(() => useDigestRows(undefined)).result.current.rows).toEqual([]);
    markDigestsRead(['x']);
    expect(renderHook(() => useDigestRows([{ ...D1, kind: 'something' as AutopilotEvent['kind'] }])).result.current.rows).toEqual([]);
  });
});

describe('digestHref', () => {
  it('opens the thread inside the room, the room alone without a post, the board without either', () => {
    expect(digestHref(D1)).toBe('/community?room=Mint111&post=p1');
    expect(digestHref({ mint: 'Mint111', postId: '' })).toBe('/community?room=Mint111');
    expect(digestHref({ mint: '', postId: '' })).toBe('/community');
  });
});

describe('NotificationBell digests', () => {
  it('lists the digests with title, Open link and unread badge, and marks a row read on Open', () => {
    const onDigestRead = vi.fn();
    render(<NotificationBell events={[]} digests={[{ ...D1, read: false }, { ...D0, read: true }]} onDigestRead={onDigestRead} />);
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-digests-unread')).toHaveTextContent('1');
    const row = screen.getByTestId('digest-item-d1');
    expect(row).toHaveAttribute('data-unread', 'true');
    expect(row).toHaveTextContent('Weekly digest posted');
    expect(screen.getByTestId('digest-item-d1-title')).toHaveTextContent('QRM weekly digest, Sep 9 to Sep 16');
    expect(screen.getByTestId('digest-item-d1-open')).toHaveAttribute('href', '/community?room=Mint111&post=p1');
    expect(screen.getByTestId('digest-item-d0')).not.toHaveAttribute('data-unread');

    fireEvent.click(screen.getByTestId('digest-item-d1-open'));
    expect(onDigestRead).toHaveBeenCalledWith('d1');
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('offers Mark all read with digests alone', () => {
    const onMarkAllRead = vi.fn();
    render(<NotificationBell events={[]} digests={[{ ...D1, read: false }]} onMarkAllRead={onMarkAllRead} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.queryByTestId('notification-empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('notification-mark-all'));
    expect(onMarkAllRead).toHaveBeenCalled();
  });
});
