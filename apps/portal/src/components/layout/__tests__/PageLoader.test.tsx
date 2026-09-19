/**
 * Purpose: Tests for PageLoader — delay before showing, dismiss when ready
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createElement } from 'react';
import { PageLoader } from '../PageLoader';

describe('PageLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null initially (delay not elapsed)', () => {
    const { container } = render(createElement(PageLoader, { ready: false }));
    expect(container.innerHTML).toBe('');
  });

  it('shows after SHOW_DELAY_MS (300ms) when ready=false', () => {
    render(createElement(PageLoader, { ready: false }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId('page-loader')).toBeInTheDocument();
  });

  it('never shows if ready=true before delay elapses', () => {
    const { rerender } = render(createElement(PageLoader, { ready: false }));

    // ready becomes true before 300ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(createElement(PageLoader, { ready: true }));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
  });

  it('dismisses with fade when ready transitions to true after showing', () => {
    const { rerender } = render(createElement(PageLoader, { ready: false }));

    // Show the loader
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('page-loader')).toBeInTheDocument();

    // Transition to ready
    rerender(createElement(PageLoader, { ready: true }));

    // Should still be in DOM (fading out, 400ms transition)
    expect(screen.getByTestId('page-loader')).toBeInTheDocument();
    expect(screen.getByTestId('page-loader').className).toContain('opacity-0');

    // After fade completes
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
  });
});
