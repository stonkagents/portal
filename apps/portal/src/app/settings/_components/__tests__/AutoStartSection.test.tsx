/**
 * Purpose: AutoStartSection is bound to the agent's autostart check: off calls the
 *          autostart fix and toasts; on is read-only with the installer note; offline
 *          shows the agent notice; no fake terminal commands anywhere.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type * as SetupModule from '@/lib/api/daemon-setup';

const mockDaemon = vi.hoisted(() => ({ connected: true, health: { peerId: 'peer-1' } }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const setupClient = vi.hoisted(() => ({ getSetupStatus: vi.fn(), applySetupFix: vi.fn() }));
vi.mock('@/lib/api/daemon-setup', async importOriginal => {
  const actual = await importOriginal<typeof SetupModule>();
  return { ...actual, ...setupClient };
});

import { AutoStartSection, AUTOSTART_ENABLED_TOAST, AUTOSTART_ON_NOTE } from '../AutoStartSection';

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
  return render(<AutoStartSection />, { wrapper: Wrapper });
}

const toggle = () => screen.getByTestId('auto-start-toggle');

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
});

describe('AutoStartSection', () => {
  it('is off and enables auto-start through the autostart fix', async () => {
    setupClient.getSetupStatus.mockResolvedValue({
      kind: 'ok',
      status: { checks: [{ id: 'autostart', status: 'missing', message: 'not set to start automatically: StonkAgentsDaemon' }] },
    });
    setupClient.applySetupFix.mockResolvedValueOnce({ kind: 'ok', check: { id: 'autostart', status: 'ok' }, restartRequired: false });
    renderSection();
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/not set to start automatically/)).toBeInTheDocument();

    setupClient.getSetupStatus.mockResolvedValue({ kind: 'ok', status: { checks: [{ id: 'autostart', status: 'ok' }] } });
    fireEvent.click(toggle());
    await waitFor(() => expect(setupClient.applySetupFix).toHaveBeenCalledWith('autostart', undefined));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: AUTOSTART_ENABLED_TOAST, variant: 'success' })),
    );
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
  });

  it('is read-only On with the installer note when the agent already auto-starts', async () => {
    setupClient.getSetupStatus.mockResolvedValue({ kind: 'ok', status: { checks: [{ id: 'autostart', status: 'ok' }] } });
    renderSection();
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    expect(toggle()).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByText(AUTOSTART_ON_NOTE)).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(setupClient.applySetupFix).not.toHaveBeenCalled();
  });

  it('toasts the daemon refusal', async () => {
    setupClient.getSetupStatus.mockResolvedValue({ kind: 'ok', status: { checks: [{ id: 'autostart', status: 'missing' }] } });
    setupClient.applySetupFix.mockResolvedValueOnce({ kind: 'error', message: 'Elevation was refused', code: 'ELEVATION_DENIED' });
    renderSection();
    await waitFor(() => expect(toggle()).toBeEnabled());
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', description: 'Elevation was refused' })),
    );
  });

  it('is inert with the agent notice offline and never shows terminal commands', () => {
    mockDaemon.connected = false;
    renderSection();
    expect(toggle()).toBeDisabled();
    expect(screen.getByTestId('auto-start-agent-required')).toBeInTheDocument();
    expect(setupClient.getSetupStatus).not.toHaveBeenCalled();
    expect(screen.queryByTestId('platform-command')).toBeNull();
    expect(screen.queryByText(/launchctl|systemctl|schtasks/)).toBeNull();
  });
});
