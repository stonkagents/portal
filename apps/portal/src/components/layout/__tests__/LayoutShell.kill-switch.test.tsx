/**
 * Purpose: LayoutShell wires the Kill Switch to DaemonProvider's stop/start (controller
 *          POST /stop and /start) and shows the SAFE MODE banner only while the owner's stop
 *          is in effect and the agent is really down. Every other shell piece is stubbed.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as KillSwitchModule from '../KillSwitch';

const daemon = vi.hoisted(() => ({
  connected: true,
  daemonStatus: 'online' as const,
  stoppedByUser: false,
  toggleDaemon: vi.fn(),
  stopAgent: vi.fn(),
  startAgent: vi.fn(),
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/providers/PageReadinessProvider', () => ({ usePageReadiness: () => ({ isPageReady: true, reportReady: vi.fn() }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/gallery' }));
vi.mock('@/lib/api/hooks/use-update-status', () => ({
  useUpdateStatus: () => ({ data: undefined, startUpdate: vi.fn(), cancelUpdate: vi.fn() }),
}));

/* The navbar stub renders the real banner and exposes the kill props, like the real Navbar does. */
vi.mock('../Navbar', async () => {
  const actual = await vi.importActual<typeof KillSwitchModule>('../KillSwitch');
  return {
    Navbar: (props: { connected?: boolean; killActive?: boolean; killBusy?: boolean; onKillToggle?: () => void }) => (
      <div data-testid="navbar-stub" data-connected={String(props.connected)}>
        {props.connected && (
          <button data-testid="kill-switch" onClick={props.onKillToggle} disabled={props.killBusy} aria-pressed={props.killActive} />
        )}
        <actual.KillBanner active={props.killActive} onResume={props.onKillToggle} busy={props.killBusy} />
      </div>
    ),
  };
});
vi.mock('../MobileDrawer', () => ({
  MobileDrawer: (props: { killActive?: boolean; killBusy?: boolean; connected?: boolean; onKillToggle?: () => void }) => (
    <button
      data-testid="drawer-safe-mode"
      onClick={props.onKillToggle}
      disabled={props.killBusy || (!props.connected && !props.killActive)}
      aria-pressed={props.killActive}
    />
  ),
}));
vi.mock('../MobileBottomNav', () => ({ MobileBottomNav: () => null }));
vi.mock('../Footer', () => ({ Footer: () => null }));
vi.mock('../SplashScreen', () => ({ SplashScreen: () => null }));
vi.mock('../PageLoader', () => ({ PageLoader: () => null }));
vi.mock('../DevResetButton', () => ({ DevResetButton: () => null }));
vi.mock('../WalletLinkEffect', () => ({ WalletLinkEffect: () => null }));
vi.mock('../NavigationLoader', () => ({ NavigationLoader: () => null }));
vi.mock('../UpdateBanner', () => ({ UpdateBanner: () => null }));
vi.mock('../UiUpdateBar', () => ({ UiUpdateBar: () => null }));
vi.mock('@/components/ui/ToastContainer', () => ({ ToastContainer: () => null }));
vi.mock('@/components/features/feedback', () => ({ FeedbackDialogHost: () => null }));
vi.mock('@/components/features/interest', () => ({ InterestDialogHost: () => null }));
vi.mock('@/components/features/devnet', () => ({ DevDrip: () => null }));

import { LayoutShell } from '../LayoutShell';

function renderShell() {
  return render(
    <LayoutShell>
      <div data-testid="page" />
    </LayoutShell>,
  );
}

describe('LayoutShell Kill Switch wiring', () => {
  beforeEach(() => {
    daemon.connected = true;
    daemon.stoppedByUser = false;
    daemon.stopAgent.mockReset().mockResolvedValue(true);
    daemon.startAgent.mockReset().mockResolvedValue(true);
    addToast.mockReset();
  });

  it('shows no banner while the agent runs, and stops it through the provider on click', async () => {
    renderShell();
    expect(screen.queryByTestId('kill-banner')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kill-switch'));
    await waitFor(() => expect(daemon.stopAgent).toHaveBeenCalledTimes(1));
    expect(daemon.startAgent).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('shows the banner only while the owner stopped the agent and it is down; Resume starts it', async () => {
    daemon.connected = false;
    daemon.stoppedByUser = true;
    renderShell();

    const banner = screen.getByTestId('kill-banner');
    expect(banner).toBeInTheDocument();
    /* The nav shield is hidden with the rest of the connected group; the banner carries Resume. */
    expect(screen.queryByTestId('kill-switch')).not.toBeInTheDocument();
    expect(screen.getByTestId('drawer-safe-mode')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('kill-banner-resume'));
    await waitFor(() => expect(daemon.startAgent).toHaveBeenCalledTimes(1));
    expect(daemon.stopAgent).not.toHaveBeenCalled();
  });

  it('shows no banner when the agent is offline for any other reason, and the drawer toggle is inert', () => {
    daemon.connected = false;
    daemon.stoppedByUser = false;
    renderShell();

    expect(screen.queryByTestId('kill-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('drawer-safe-mode')).toBeDisabled();
  });

  it('toasts when the controller refuses the stop', async () => {
    daemon.stopAgent.mockResolvedValue(false);
    renderShell();

    fireEvent.click(screen.getByTestId('kill-switch'));
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    expect(addToast.mock.calls[0][0]).toMatchObject({ title: 'killSwitch.stopFailed', variant: 'error' });
  });
});
