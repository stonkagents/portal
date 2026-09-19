/**
 * Purpose: Tests for NavigationLoader — click interception, overlay timing, dismiss on nav
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createElement } from 'react';

// Track the mocked pathname and allow tests to change it
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { NavigationLoader, SAFETY_MS, isSamePathname } from '../NavigationLoader';

describe('NavigationLoader', () => {
  beforeEach(() => {
    mockPathname = '/';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns null when not visible', () => {
    const { container } = render(createElement(NavigationLoader));
    expect(container.innerHTML).toBe('');
  });

  it('shows overlay after SHOW_DELAY_MS when internal link clicked', () => {
    render(createElement(NavigationLoader));

    // Create an anchor and click it
    const link = document.createElement('a');
    link.href = '/peers';
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true });

    // Not visible yet (150ms delay)
    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();

    // Advance past show delay (150ms)
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByTestId('navigation-loader')).toBeInTheDocument();

    document.body.removeChild(link);
  });

  it('does NOT trigger for external links (no leading /)', () => {
    render(createElement(NavigationLoader));

    const link = document.createElement('a');
    link.href = 'https://example.com';
    link.setAttribute('href', 'https://example.com');
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();

    document.body.removeChild(link);
  });

  it('does NOT trigger when modifier keys are pressed', () => {
    render(createElement(NavigationLoader));

    const link = document.createElement('a');
    link.href = '/peers';
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true, metaKey: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();

    document.body.removeChild(link);
  });

  it('does NOT trigger when clicking the current page link', () => {
    mockPathname = '/peers';
    render(createElement(NavigationLoader));

    const link = document.createElement('a');
    link.href = '/peers';
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();

    document.body.removeChild(link);
  });

  it('shows contextual message for known routes', () => {
    render(createElement(NavigationLoader));

    const link = document.createElement('a');
    link.href = '/peers';
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    const overlay = screen.getByTestId('navigation-loader');
    const text = overlay.textContent ?? '';
    // Should show one of the /peers messages
    expect(text === 'Reaching agents...' || text === 'Scanning the Network...').toBe(true);

    document.body.removeChild(link);
  });

  it('dismisses on fast navigation (pathname changes before min timer)', () => {
    const { rerender } = render(createElement(NavigationLoader));

    const link = document.createElement('a');
    link.href = '/community';
    document.body.appendChild(link);

    // Click → after 150ms show delay, overlay appears
    fireEvent.click(link, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('navigation-loader')).toBeInTheDocument();

    // Fast navigation: pathname changes 100ms after overlay shows (before 400ms min timer)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    mockPathname = '/community/';
    rerender(createElement(NavigationLoader));

    // Advance well past the min timer — overlay MUST dismiss
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();

    document.body.removeChild(link);
  });

  it('does NOT trigger for non-anchor clicks', () => {
    render(createElement(NavigationLoader));

    const div = document.createElement('div');
    document.body.appendChild(div);

    fireEvent.click(div, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();

    document.body.removeChild(div);
  });
});

describe('NavigationLoader on the same pathname and stuck navigations', () => {
  beforeEach(() => {
    mockPathname = '/community';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT show for a link that only changes the query (a bell row opening a thread on the board)', () => {
    render(createElement(NavigationLoader));
    const link = document.createElement('a');
    link.setAttribute('href', '/community?post=p1');
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();
    document.body.removeChild(link);
  });

  it('treats a trailing slash as the same pathname', () => {
    expect(isSamePathname('/community/?post=p1', '/community')).toBe(true);
    expect(isSamePathname('/community#top', '/community/')).toBe(true);
    expect(isSamePathname('/peers', '/community')).toBe(false);
    expect(isSamePathname('/', '/')).toBe(true);
  });

  it('dismisses by itself after SAFETY_MS when no pathname change arrives', () => {
    render(createElement(NavigationLoader));
    const link = document.createElement('a');
    link.setAttribute('href', '/peers');
    document.body.appendChild(link);

    fireEvent.click(link, { bubbles: true });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('navigation-loader')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SAFETY_MS - 1);
    });
    expect(screen.getByTestId('navigation-loader')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('navigation-loader')).not.toBeInTheDocument();
    document.body.removeChild(link);
  });
});
