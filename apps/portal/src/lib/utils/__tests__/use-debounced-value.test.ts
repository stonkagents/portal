/**
 * Purpose: Tests for useDebouncedValue — true time-based debounce
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedValue } from '../use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update until delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('ab');
  });

  it('resets timer on rapid updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    );

    rerender({ value: 'a' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'ab' });
    act(() => { vi.advanceTimersByTime(200); });
    // 400ms total but timer reset — should still be initial
    expect(result.current).toBe('');

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('ab');
  });
});
