/**
 * Purpose: Unit tests for usePoll hook — interval firing, cleanup, fallback, isOnline toggle
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePoll } from '../use-poll';

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fallback data initially', () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() => usePoll({ fetcher, fallback: 'default', interval: 1000 }));
    expect(result.current.data).toBe('default');
    expect(result.current.isOnline).toBe(false);
  });

  it('updates data when fetcher returns non-null', async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 42 });
    const { result } = renderHook(() => usePoll({ fetcher, fallback: { count: 0 }, interval: 5000 }));

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 42 });
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('stays offline when fetcher returns null', async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() => usePoll({ fetcher, fallback: 'fb', interval: 1000 }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledOnce();
    });
    expect(result.current.isOnline).toBe(false);
    expect(result.current.data).toBe('fb');
  });

  it('polls at the specified interval', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    renderHook(() => usePoll({ fetcher, fallback: '', interval: 2000 }));

    // Wait for initial call
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledOnce();
    });

    // Advance past one interval
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it('cleans up interval on unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const { unmount } = renderHook(() => usePoll({ fetcher, fallback: '', interval: 1000 }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledOnce();
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // Should not have been called again after unmount
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not poll when enabled is false', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    renderHook(() => usePoll({ fetcher, fallback: '', interval: 1000, enabled: false }));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('backs off exponentially after failures up to maxInterval and resets on success (PERF-3)', async () => {
    /* Exact timings: no real-time drift into the fake clock. */
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(null);
    renderHook(() => usePoll({ fetcher, fallback: '', interval: 1000, maxInterval: 4000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    // failure 1 → 1000, failure 2 → 2000, failure 3 → 4000, failure 4 → 4000 (capped)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetcher).toHaveBeenCalledTimes(5);

    fetcher.mockResolvedValue('back');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it('pauses while the document is hidden and fetches again when it becomes visible', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('ok');
    renderHook(() => usePoll({ fetcher, fallback: '', interval: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledOnce();

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetcher).toHaveBeenCalledOnce();

    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it('refresh re-fetches immediately', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return `result-${callCount}`;
    });

    const { result } = renderHook(() => usePoll({ fetcher, fallback: '', interval: 60000 }));

    await waitFor(() => {
      expect(result.current.data).toBe('result-1');
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toBe('result-2');
  });
});
