/**
 * Purpose: Kill Switch (Safe Mode) surfaces. The button and banner are dumb views; the state
 *          they reflect is the owner's stop kept in DaemonProvider and wired by LayoutShell
 *          (see LayoutShell.kill-switch.test.tsx).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '@/providers/I18nProvider';
import { KillSwitch, KillBanner } from '../KillSwitch';

describe('KillSwitch button', () => {
  it('reads as "stop" when idle and "resume" when the agent is stopped', () => {
    const { rerender } = render(<KillSwitch active={false} />);
    expect(screen.getByTestId('kill-switch')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('kill-switch')).toHaveAccessibleName(/stop agent/i);

    rerender(<KillSwitch active />);
    expect(screen.getByTestId('kill-switch')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('kill-switch')).toHaveAccessibleName(/resume agent/i);
  });

  it('calls onToggle, and not while disabled', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<KillSwitch onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('kill-switch'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<KillSwitch onToggle={onToggle} disabled />);
    fireEvent.click(screen.getByTestId('kill-switch'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('KillBanner', () => {
  it('renders nothing while the agent is not stopped by the owner', () => {
    render(<KillBanner active={false} />);
    expect(screen.queryByTestId('kill-banner')).not.toBeInTheDocument();
  });

  it('says the agent is stopped and offers Resume agent', () => {
    const onResume = vi.fn();
    render(
      <I18nProvider>
        <KillBanner active onResume={onResume} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('kill-banner')).toHaveTextContent(/your agent is stopped/i);
    const resume = screen.getByTestId('kill-banner-resume');
    expect(resume).toHaveTextContent('Resume agent');
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('disables Resume while the start request is in flight', () => {
    render(
      <I18nProvider>
        <KillBanner active busy />
      </I18nProvider>,
    );
    expect(screen.getByTestId('kill-banner-resume')).toBeDisabled();
    expect(screen.getByTestId('kill-banner-resume')).toHaveTextContent('Resuming...');
  });
});
