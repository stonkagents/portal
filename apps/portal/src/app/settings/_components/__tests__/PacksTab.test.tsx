/**
 * Purpose: The Packs tab lists what the agent installed with where it came from,
 *          its version, when it was written and the files on disk; removal asks
 *          first and says what will be deleted; and the empty, offline, not ready
 *          and older agent states each say what is going on.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type { InstalledPackItem, InstalledPacksAnswer } from '@/lib/api/daemon-packs';
import type * as DaemonPacksModule from '@/lib/api/daemon-packs';
import { ApiRequestError } from '@/lib/api/errors';

const mockDaemon = vi.hoisted(() => ({ connected: true, envMismatch: null }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const client = vi.hoisted(() => ({
  getInstalledPackItems: vi.fn(),
  installPackItems: vi.fn(),
  removeInstalledPackItem: vi.fn(),
}));
vi.mock('@/lib/api/daemon-packs', async importOriginal => {
  const actual = await importOriginal<typeof DaemonPacksModule>();
  return { ...actual, ...client };
});

import { PacksTab, PACK_REMOVED_TOAST, PACK_REMOVE_FAILED_TOAST } from '../PacksTab';
import { PACK_UNSUPPORTED } from '@/lib/utils/pack-install';

const STATE_DIR = {
  dir: 'D:\\home\\.openclaw',
  skillsDir: 'D:\\home\\.openclaw\\skills',
  source: 'home',
  home: 'C:\\Users\\me',
  exists: true,
  note: '',
};

function installed(over: Partial<InstalledPackItem> = {}): InstalledPackItem {
  return {
    id: 'network-basics',
    name: 'network-basics',
    type: 'claw-memory',
    pack: 'starter-pack',
    version: '1.0.0',
    title: 'How the network works',
    description: 'Peers, the tracker, CIDs.',
    cid: 'bafkrei1',
    sha256: 'abc',
    installedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    paths: ['skills/network-basics/SKILL.md', 'skills/network-basics/reference/glossary.md'],
    wants: { bins: ['gh'], os: [], installHooks: false },
    ...over,
  };
}

function answer(over: Partial<InstalledPacksAnswer> = {}): InstalledPacksAnswer {
  return { status: 'ok', message: '', stateDir: STATE_DIR, items: [], ...over };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockDaemon.connected = true;
  addToast.mockReset();
  client.getInstalledPackItems.mockReset().mockResolvedValue(answer());
  client.removeInstalledPackItem.mockReset();
});

describe('Settings > Packs', () => {
  it('says the agent has nothing installed, and points at the gallery', async () => {
    render(<PacksTab />, { wrapper });
    const empty = await screen.findByTestId('packs-tab-empty');
    expect(empty).toHaveTextContent('nothing installed from a pack');
    expect(screen.getByRole('link', { name: /gallery/i })).toHaveAttribute('href', '/gallery');
  });

  it('lists what is installed: the pack, the version, when, where and what it wants', async () => {
    client.getInstalledPackItems.mockResolvedValue(answer({ items: [installed()] }));
    render(<PacksTab />, { wrapper });

    const row = await screen.findByTestId('packs-tab-item-network-basics');
    expect(row).toHaveTextContent('How the network works');
    expect(row).toHaveTextContent('starter-pack');
    expect(row).toHaveTextContent('Version 1.0.0');
    expect(row).toHaveTextContent('Installed 3m ago');
    expect(row).toHaveTextContent('skills/network-basics/SKILL.md');
    expect(row).toHaveTextContent('skills/network-basics/reference/glossary.md');
    expect(row).toHaveTextContent('Wants the program gh on the machine. We do not install it or run it.');
    expect(screen.getByTestId('packs-tab-destination')).toHaveTextContent('D:\\home\\.openclaw\\skills');
  });

  it('asks before removing, naming every file it will delete', async () => {
    client.getInstalledPackItems.mockResolvedValue(answer({ items: [installed()] }));
    client.removeInstalledPackItem.mockResolvedValue({
      status: 'removed',
      message: 'removed network-basics and the 2 files it installed',
      stateDir: STATE_DIR,
      item: installed(),
    });
    render(<PacksTab />, { wrapper });

    fireEvent.click(await screen.findByTestId('packs-tab-remove-network-basics'));
    const confirm = screen.getByTestId('packs-remove-confirm');
    expect(confirm).toHaveTextContent('This deletes the 2 files your agent wrote for network-basics');
    expect(confirm).toHaveTextContent('Anything you added to that folder yourself is left alone.');
    expect(confirm).toHaveTextContent('skills/network-basics/SKILL.md');
    expect(client.removeInstalledPackItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('packs-remove-confirm-button'));
    await waitFor(() => expect(client.removeInstalledPackItem.mock.calls[0][0]).toBe('network-basics'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: PACK_REMOVED_TOAST, description: 'removed network-basics and the 2 files it installed' }),
      ),
    );
  });

  it('keeps it when the confirmation is declined', async () => {
    client.getInstalledPackItems.mockResolvedValue(answer({ items: [installed()] }));
    render(<PacksTab />, { wrapper });

    fireEvent.click(await screen.findByTestId('packs-tab-remove-network-basics'));
    fireEvent.click(screen.getByTestId('packs-remove-cancel'));

    await waitFor(() => expect(screen.queryByTestId('packs-remove-confirm')).not.toBeInTheDocument());
    expect(client.removeInstalledPackItem).not.toHaveBeenCalled();
  });

  it('says why a removal failed, in the words the agent sent', async () => {
    client.getInstalledPackItems.mockResolvedValue(answer({ items: [installed()] }));
    client.removeInstalledPackItem.mockRejectedValue(
      new ApiRequestError(404, { code: 'NOT_INSTALLED', message: 'this agent has no record of installing network-basics' }),
    );
    render(<PacksTab />, { wrapper });

    fireEvent.click(await screen.findByTestId('packs-tab-remove-network-basics'));
    fireEvent.click(screen.getByTestId('packs-remove-confirm-button'));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: PACK_REMOVE_FAILED_TOAST,
          description: 'this agent has no record of installing network-basics',
        }),
      ),
    );
  });

  it('says the command tools are still finishing rather than showing an empty list', async () => {
    client.getInstalledPackItems.mockResolvedValue(
      answer({ status: 'not_ready', message: 'The command tools are still finishing.', stateDir: { ...STATE_DIR, exists: false } }),
    );
    render(<PacksTab />, { wrapper });

    expect(await screen.findByTestId('packs-tab-not-ready')).toHaveTextContent('command tools are still finishing');
    expect(screen.queryByTestId('packs-tab-empty')).not.toBeInTheDocument();
  });

  it('says to update an agent that predates packs', async () => {
    client.getInstalledPackItems.mockRejectedValue(new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Route not found' }));
    render(<PacksTab />, { wrapper });

    expect(await screen.findByTestId('packs-tab-unsupported')).toHaveTextContent(PACK_UNSUPPORTED);
  });

  it('offline: the agent notice, and no list to read', () => {
    mockDaemon.connected = false;
    render(<PacksTab />, { wrapper });

    expect(screen.getByTestId('agent-required')).toBeInTheDocument();
    expect(screen.queryByTestId('packs-tab-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('packs-tab-empty')).not.toBeInTheDocument();
    expect(client.getInstalledPackItems).not.toHaveBeenCalled();
  });
});
