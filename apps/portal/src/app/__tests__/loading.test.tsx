/**
 * Purpose: Tests for root loading.tsx — neon dots and contextual messages
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import Loading from '../loading';

describe('Loading (root Suspense fallback)', () => {
  it('renders with data-testid="route-loading"', () => {
    mockPathname = '/';
    render(createElement(Loading));
    expect(screen.getByTestId('route-loading')).toBeInTheDocument();
  });

  it('renders 3 neon dots', () => {
    mockPathname = '/';
    render(createElement(Loading));
    const dots = screen.getByTestId('route-loading').querySelectorAll('.rounded-full');
    expect(dots.length).toBe(3);
  });

  it('shows route-specific message for /peers', () => {
    mockPathname = '/peers';
    render(createElement(Loading));
    const text = screen.getByTestId('route-loading').textContent ?? '';
    expect(text === 'Reaching agents...' || text === 'Scanning the Network...').toBe(true);
  });

  it('shows route-specific message for /chat', () => {
    mockPathname = '/chat';
    render(createElement(Loading));
    const text = screen.getByTestId('route-loading').textContent ?? '';
    expect(text === 'Connecting to OpenClaw...' || text === 'Warming up your agent...').toBe(true);
  });

  it('shows fallback message for unknown routes', () => {
    mockPathname = '/unknown-route';
    render(createElement(Loading));
    const text = screen.getByTestId('route-loading').textContent ?? '';
    expect(text).toBe('Connecting to the Network...');
  });
});
