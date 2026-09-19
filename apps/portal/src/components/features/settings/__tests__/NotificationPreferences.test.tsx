/**
 * Purpose: Tests for NotificationPreferences — preset selector,
 *          per-category triage level controls, and security floor enforcement.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NotificationPreferences } from '../NotificationPreferences';
import type { NotificationPrefs } from '@/lib/types/claw-event';

const defaultPrefs: NotificationPrefs = {
  preset: 'balanced',
  overrides: {
    sync: 'nudge',
    peer: 'silent',
    reputation: 'silent',
    credit: 'nudge',
    security: 'alert',
    system: 'nudge',
    agent: 'nudge',
  },
};

describe('NotificationPreferences', () => {
  it('renders the preferences panel', () => {
    render(<NotificationPreferences prefs={defaultPrefs} onChange={vi.fn()} />);
    expect(screen.getByTestId('notification-prefs')).toBeInTheDocument();
  });

  it('renders the preset selector', () => {
    render(<NotificationPreferences prefs={defaultPrefs} onChange={vi.fn()} />);
    expect(screen.getByTestId('prefs-preset')).toBeInTheDocument();
  });

  it('calls onChange when preset changes', () => {
    const onChange = vi.fn();
    render(<NotificationPreferences prefs={defaultPrefs} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('prefs-preset'), { target: { value: 'minimal' } });
    expect(onChange).toHaveBeenCalled();
    const newPrefs = onChange.mock.calls[0][0] as NotificationPrefs;
    expect(newPrefs.preset).toBe('minimal');
  });

  it('renders per-category controls', () => {
    render(<NotificationPreferences prefs={defaultPrefs} onChange={vi.fn()} />);
    expect(screen.getByTestId('prefs-category-sync')).toBeInTheDocument();
    expect(screen.getByTestId('prefs-category-security')).toBeInTheDocument();
    expect(screen.getByTestId('prefs-category-agent')).toBeInTheDocument();
  });

  it('calls onChange when a category override changes', () => {
    const onChange = vi.fn();
    render(<NotificationPreferences prefs={defaultPrefs} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('prefs-category-sync'), { target: { value: 'alert' } });
    expect(onChange).toHaveBeenCalled();
    const newPrefs = onChange.mock.calls[0][0] as NotificationPrefs;
    expect(newPrefs.overrides.sync).toBe('alert');
  });

  it('enforces minimum nudge for security category', () => {
    const onChange = vi.fn();
    render(<NotificationPreferences prefs={defaultPrefs} onChange={onChange} />);
    // Security select should not have 'silent' or 'digest' options
    const securitySelect = screen.getByTestId('prefs-category-security');
    const options = securitySelect.querySelectorAll('option');
    const values = Array.from(options).map(o => o.getAttribute('value'));
    expect(values).not.toContain('silent');
    expect(values).not.toContain('digest');
    expect(values).toContain('nudge');
    expect(values).toContain('alert');
  });
});
