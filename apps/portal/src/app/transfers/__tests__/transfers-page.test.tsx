/**
 * Purpose: TDD tests for Transfers page — daemon offline banner, responsive layout, mutation states
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/providers/I18nProvider';

// Mock DaemonProvider
const mockUseDaemon = vi.fn();
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => mockUseDaemon(),
}));

// Mock ToastProvider (required by TransferCard)
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// Mock all transfer hooks
const mockUseTransfers = vi.fn();
const mockUsePauseTransfer = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseResumeTransfer = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseCancelTransfer = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseRetryTransfer = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUsePauseAll = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseResumeAll = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseClearCompleted = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/lib/api/hooks/use-transfers', () => ({
  useTransfers: () => mockUseTransfers(),
  usePauseTransfer: () => mockUsePauseTransfer(),
  useResumeTransfer: () => mockUseResumeTransfer(),
  useCancelTransfer: () => mockUseCancelTransfer(),
  useRetryTransfer: () => mockUseRetryTransfer(),
  usePauseAll: () => mockUsePauseAll(),
  useResumeAll: () => mockUseResumeAll(),
  useClearCompleted: () => mockUseClearCompleted(),
  useLibrary: () => ({ data: undefined, isLoading: false, isError: false }),
}));

// Default mock return for useTransfers
function setupDefaultMocks() {
  mockUseTransfers.mockReturnValue({
    data: {
      transfers: [],
      stats: {
        active: 0,
        uploading: 0,
        downloading: 0,
        completed: 0,
        failed: 0,
        totalUp: '0 B',
        totalDown: '0 B',
        speedUp: 0,
        speedDown: 0,
      },
    },
  });
}

// Lazy import to ensure mocks are registered first
async function renderPage() {
  const mod = await import('../page');
  const TransfersPage = mod.default;
  return render(<TransfersPage />, { wrapper: I18nProvider });
}

describe('Transfers page daemon offline banner', () => {
  it('shows daemon offline banner when daemon is not connected', async () => {
    mockUseDaemon.mockReturnValue({ connected: false, daemonStatus: 'offline', health: null });
    setupDefaultMocks();
    await renderPage();
    expect(screen.getByTestId('agent-offline-notice')).toBeDefined();
    expect(screen.getByText(/your agent is offline/i)).toBeDefined();
  });

  it('does not show daemon offline banner when daemon is connected', async () => {
    mockUseDaemon.mockReturnValue({ connected: true, daemonStatus: 'online', health: { status: 'ok', peerId: 'test', peers: 3 } });
    setupDefaultMocks();
    await renderPage();
    expect(screen.queryByTestId('agent-offline-notice')).toBeNull();
  });
});

describe('Transfers page mobile responsive layout', () => {
  it('filter chips container uses flex-wrap, not overflow-x-auto', async () => {
    mockUseDaemon.mockReturnValue({ connected: true, daemonStatus: 'online', health: { status: 'ok', peerId: 'test', peers: 3 } });
    setupDefaultMocks();
    await renderPage();
    const filterContainer = screen.getByTestId('transfer-type-filters');
    expect(filterContainer.className).toContain('flex-wrap');
    expect(filterContainer.className).not.toContain('overflow-x-auto');
  });

  it('action buttons container uses flex-wrap', async () => {
    mockUseDaemon.mockReturnValue({ connected: true, daemonStatus: 'online', health: { status: 'ok', peerId: 'test', peers: 3 } });
    setupDefaultMocks();
    await renderPage();
    const actions = screen.getByTestId('transfer-actions');
    expect(actions.className).toContain('flex-wrap');
  });
});
