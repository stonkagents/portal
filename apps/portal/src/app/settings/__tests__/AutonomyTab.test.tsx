/**
 * Purpose: Settings > Autonomy: the kill switch stops the agent through the provider's
 *          stopAgent (controller stop) and starts it with startAgent when offline; the
 *          invented autonomy slider, auto-post, auto-accept and spending caps are gone.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type * as SetupModule from '@/lib/api/daemon-setup';

const stopAgent = vi.hoisted(() => vi.fn(async () => true));
const startAgent = vi.hoisted(() => vi.fn(async () => true));
const mockDaemon = vi.hoisted(() => ({
  connected: true,
  daemonStatus: 'online' as 'online' | 'degraded' | 'offline',
  support: 'supported' as 'supported' | 'unsupported' | 'unknown',
  health: { peerId: 'peer-1' },
  stoppedByUser: false,
  stopAgent,
  startAgent,
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const setupClient = vi.hoisted(() => ({ getSetupStatus: vi.fn(), applySetupFix: vi.fn() }));
vi.mock('@/lib/api/daemon-setup', async importOriginal => {
  const actual = await importOriginal<typeof SetupModule>();
  return { ...actual, ...setupClient };
});

import { AutonomyTab, KILL_SWITCH_REFUSED_TOAST, KILL_SWITCH_START_TOAST, KILL_SWITCH_STOP_TOAST } from '../_components/AutonomyTab';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
  return render(<AutonomyTab />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  mockDaemon.daemonStatus = 'online';
  mockDaemon.support = 'supported';
  mockDaemon.stoppedByUser = false;
  stopAgent.mockResolvedValue(true);
  startAgent.mockResolvedValue(true);
  setupClient.getSetupStatus.mockResolvedValue({ kind: 'ok', status: { checks: [{ id: 'autostart', status: 'ok' }] } });
});

describe('AutonomyTab kill switch', () => {
  it('stops the agent through the controller and toasts', async () => {
    renderTab();
    const btn = screen.getByTestId('kill-switch-activate');
    expect(btn).toHaveTextContent('Stop agent');
    expect(screen.getByTestId('kill-switch-status')).toHaveTextContent('Agent running');
    fireEvent.click(btn);
    await waitFor(() => expect(stopAgent).toHaveBeenCalledTimes(1));
    expect(startAgent).not.toHaveBeenCalled();
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: KILL_SWITCH_STOP_TOAST })));
  });

  it('toasts when the controller refuses the stop', async () => {
    stopAgent.mockResolvedValueOnce(false);
    renderTab();
    fireEvent.click(screen.getByTestId('kill-switch-activate'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: KILL_SWITCH_REFUSED_TOAST, variant: 'error' })),
    );
  });

  it('offers Start when the agent is stopped, through the same controller path', async () => {
    mockDaemon.connected = false;
    mockDaemon.daemonStatus = 'offline';
    renderTab();
    const btn = screen.getByTestId('kill-switch-activate');
    expect(btn).toHaveTextContent('Start agent');
    expect(screen.getByTestId('kill-switch-status')).toHaveTextContent('Agent stopped');
    fireEvent.click(btn);
    await waitFor(() => expect(startAgent).toHaveBeenCalledTimes(1));
    expect(stopAgent).not.toHaveBeenCalled();
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: KILL_SWITCH_START_TOAST })));
  });

  it('names safe mode when the owner stopped the agent', () => {
    mockDaemon.connected = false;
    mockDaemon.daemonStatus = 'offline';
    mockDaemon.stoppedByUser = true;
    renderTab();
    expect(screen.getByTestId('kill-switch-status')).toHaveTextContent('Safe mode: stopped by you');
  });

  it('is disabled on a platform without the agent', () => {
    mockDaemon.connected = false;
    mockDaemon.daemonStatus = 'offline';
    mockDaemon.support = 'unsupported';
    renderTab();
    expect(screen.getByTestId('kill-switch-activate')).toBeDisabled();
  });
});

describe('AutonomyTab removed controls', () => {
  it('has no autonomy level, auto-post, auto-accept or spending caps, and keeps the safety-events empty state', () => {
    renderTab();
    expect(screen.queryByTestId('autonomy-slider')).toBeNull();
    expect(screen.queryByTestId('autonomy-value')).toBeNull();
    expect(screen.queryByTestId('settings-auto-post')).toBeNull();
    expect(screen.queryByTestId('settings-auto-accept-bounties')).toBeNull();
    expect(screen.queryByTestId('settings-transfer-limit')).toBeNull();
    expect(screen.queryByTestId('settings-daily-cap')).toBeNull();
    expect(screen.queryByTestId('platform-command')).toBeNull();
    expect(screen.getByTestId('incident-empty')).toBeInTheDocument();
    expect(screen.getByTestId('auto-start-section')).toBeInTheDocument();
  });
});
