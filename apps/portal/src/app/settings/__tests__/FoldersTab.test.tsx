/**
 * Purpose: Settings > Folders: the data directory comes from the agent's storage check,
 *          the download folder is derived from it the way the daemon joins paths, Change
 *          calls the storage fix with {path} and shows the 202 restart note, and the
 *          invented auto-seed, auto-cleanup and cache cap are gone.
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

const mockLibrary = vi.hoisted(() => ({
  data: { files: [], storage: { used_bytes: 3 * 1024 * 1024, file_count: 2 } } as
    | { files: unknown[]; storage: { used_bytes: number; file_count: number } }
    | undefined,
  isLoading: false,
}));
vi.mock('@/lib/api/hooks/use-transfers', () => ({ useLibrary: () => mockLibrary }));

import { FoldersTab, STORAGE_SAVED_TOAST, downloadsDir } from '../_components/FoldersTab';
import { SETUP_RESTART_REQUIRED_NOTE } from '@/lib/api/daemon-setup';

const DATA_DIR = 'D:\\home\\.stonkagents\\data';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
  return render(<FoldersTab />, { wrapper: Wrapper });
}

const dataDir = () => screen.getByTestId('settings-data-dir') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  setupClient.getSetupStatus.mockResolvedValue({
    kind: 'ok',
    status: { checks: [{ id: 'storage', status: 'ok', detail: { path: DATA_DIR, freeBytes: 1e12 } }] },
  });
});

describe('downloadsDir', () => {
  it('joins with the separator the path already uses', () => {
    expect(downloadsDir('C:\\agent\\data')).toBe('C:\\agent\\data\\downloads');
    expect(downloadsDir('/home/me/.stonkagents/data/')).toBe('/home/me/.stonkagents/data/downloads');
  });
});

describe('FoldersTab', () => {
  it('shows the data directory from the agent and the download folder under it', async () => {
    renderTab();
    await waitFor(() => expect(dataDir().value).toBe(DATA_DIR));
    expect(dataDir()).toHaveAttribute('readonly');
    expect((screen.getByTestId('settings-download-dir') as HTMLInputElement).value).toBe(`${DATA_DIR}\\downloads`);
    expect(screen.queryByTestId('settings-upload-dir')).toBeNull();
  });

  it('changes the directory through the storage fix and shows the restart note from the 202', async () => {
    const moved = 'D:\\agent-data';
    setupClient.applySetupFix.mockResolvedValueOnce({
      kind: 'ok',
      check: { id: 'storage', status: 'ok', detail: { path: moved, restartRequired: true } },
      restartRequired: true,
    });
    renderTab();
    await waitFor(() => expect(dataDir().value).toBe(DATA_DIR));

    fireEvent.click(screen.getByTestId('settings-data-dir-change'));
    const save = screen.getByTestId('settings-data-dir-save');
    expect(save).toBeDisabled();
    fireEvent.change(dataDir(), { target: { value: moved } });
    expect(save).toBeEnabled();

    setupClient.getSetupStatus.mockResolvedValue({
      kind: 'ok',
      status: { checks: [{ id: 'storage', status: 'ok', detail: { path: DATA_DIR, pendingPath: moved, restartRequired: true } }] },
    });
    fireEvent.click(save);

    await waitFor(() => expect(setupClient.applySetupFix).toHaveBeenCalledWith('storage', { path: moved }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: STORAGE_SAVED_TOAST, description: SETUP_RESTART_REQUIRED_NOTE, variant: 'success' }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('settings-data-dir-pending')).toHaveTextContent(moved));
  });

  it('toasts a refused path', async () => {
    setupClient.applySetupFix.mockResolvedValueOnce({
      kind: 'error',
      message: 'path must be under the profile',
      code: 'INVALID_REQUEST',
    });
    renderTab();
    await waitFor(() => expect(dataDir().value).toBe(DATA_DIR));
    fireEvent.click(screen.getByTestId('settings-data-dir-change'));
    fireEvent.change(dataDir(), { target: { value: '\\\\server\\share' } });
    fireEvent.click(screen.getByTestId('settings-data-dir-save'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'path must be under the profile' }),
      ),
    );
  });

  it('shows real usage and file count without a cap, and no seed or cleanup toggles', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('settings-storage-used')).toHaveTextContent('3'));
    expect(screen.getByTestId('settings-storage-used')).not.toHaveTextContent('/');
    expect(screen.getByText('2 shared files')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-auto-seed')).toBeNull();
    expect(screen.queryByTestId('settings-auto-cleanup')).toBeNull();
    expect(screen.queryByTestId('settings-cache-limit')).toBeNull();
  });

  it('is inert with the agent notice offline', () => {
    mockDaemon.connected = false;
    renderTab();
    expect(dataDir().value).toBe('-');
    expect(screen.getByTestId('settings-data-dir-change')).toBeDisabled();
    expect(screen.getByTestId('settings-data-dir-agent-required')).toBeInTheDocument();
    expect(screen.getByTestId('settings-storage-offline')).toBeInTheDocument();
    expect(setupClient.getSetupStatus).not.toHaveBeenCalled();
  });
});
