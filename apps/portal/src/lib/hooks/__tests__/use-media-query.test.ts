/**
 * useMediaQuery: false until the effect runs, then the query's answer, kept
 * current on change and released on unmount. The navbar relies on the initial
 * false so the server and the first client render agree.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useMediaQuery } from '../use-media-query';

type Listener = () => void;

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mq = {
    matches,
    addEventListener: vi.fn((_: string, fn: Listener) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: Listener) => listeners.delete(fn)),
  };
  window.matchMedia = vi.fn().mockReturnValue(mq) as unknown as typeof window.matchMedia;
  return {
    mq,
    flip(next: boolean) {
      mq.matches = next;
      listeners.forEach(fn => fn());
    },
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe('useMediaQuery', () => {
  it('answers the query once mounted and follows changes', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 900px)'));
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 900px)');

    act(() => media.flip(false));
    expect(result.current).toBe(false);
  });

  it('stops listening on unmount', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 900px)'));
    unmount();
    expect(media.mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
