/**
 * Purpose: Tests for HeroDaemonCrashed — daemon offline hero component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HeroDaemonCrashed, formatLastSeen } from '../HeroDaemonCrashed';

describe('HeroDaemonCrashed', () => {
  it('renders the crashed state heading', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    expect(screen.getByText('Your Agent went offline')).toBeInTheDocument();
  });

  it('shows no made-up last-seen, error text or inert log link', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    expect(screen.queryByTestId('hero-daemon-last-seen')).not.toBeInTheDocument();
    expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument();
    expect(screen.queryByText(/View logs/)).not.toBeInTheDocument();
  });

  it('shows the real last-seen time when the caller has one', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} lastSeenAt={Date.now() - 5 * 60_000} />);
    expect(screen.getByTestId('hero-daemon-last-seen')).toHaveTextContent('Last seen 5 min ago');
  });

  it('formats last-seen relative to now', () => {
    const now = 1_000_000_000_000;
    expect(formatLastSeen(now - 10_000, now)).toBe('less than a minute ago');
    expect(formatLastSeen(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatLastSeen(now - 2 * 86_400_000, now)).toBe('2 d ago');
    expect(formatLastSeen('not a date', now)).toBe('');
  });

  it('does not pulse the offline dot', () => {
    const { container } = render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    expect(container.querySelector('.animate-daemon-pulse')).toBeNull();
  });

  it('renders the restart button', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    expect(screen.getByTestId('restart-daemon-button')).toBeInTheDocument();
  });

  it('fires onRestart when restart button is clicked', () => {
    const onRestart = vi.fn();
    render(<HeroDaemonCrashed onRestart={onRestart} />);
    fireEvent.click(screen.getByTestId('restart-daemon-button'));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('shows data safety reassurance', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    expect(screen.getByText('Your data is safe')).toBeInTheDocument();
  });

  it('says what to do by hand when Restart cannot reach the controller either', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    const hint = screen.getByTestId('hero-daemon-crashed-hint');
    expect(hint).toHaveTextContent('Start Menu');
    expect(hint).toHaveTextContent('Windows Services');
    expect(hint.textContent).not.toMatch(/[–—]/);
  });

  it('has correct test id on root element', () => {
    render(<HeroDaemonCrashed onRestart={vi.fn()} />);
    expect(screen.getByTestId('hero-daemon-crashed')).toBeInTheDocument();
  });
});
