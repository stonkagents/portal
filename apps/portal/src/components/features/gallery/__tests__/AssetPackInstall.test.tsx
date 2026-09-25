/**
 * Purpose: A search result the pack catalog pins can be installed on its own, by
 *          the CID the catalog pins for it: what it writes is said first, the
 *          outcome comes back in the agent's own words, an item already on the
 *          agent is stated rather than offered, and no agent means no button.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TransformedPackItem } from '@/lib/api/transformers/gallery';
import type { PackInstallAnswer } from '@/lib/api/daemon-packs';
import type * as DaemonPacksModule from '@/lib/api/daemon-packs';
import { ApiRequestError } from '@/lib/api/errors';

const client = vi.hoisted(() => ({ installPackItems: vi.fn(), getInstalledPackItems: vi.fn(), removeInstalledPackItem: vi.fn() }));
vi.mock('@/lib/api/daemon-packs', async importOriginal => {
  const actual = await importOriginal<typeof DaemonPacksModule>();
  return { ...actual, ...client };
});

import { AssetPackInstall } from '../AssetPackInstall';

const ITEM: TransformedPackItem = {
  id: 'network-basics',
  filename: 'network-basics.claw-memory.json',
  type: 'claw-memory',
  title: 'How the network works',
  description: 'Peers, the tracker, CIDs.',
  version: '1.0.0',
  cid: 'bafkrei1',
  size: 8176,
  touches: 'Writes <state>/skills/network-basics/ (2 files). Nothing else on the machine changes.',
  packId: 'starter-pack',
  packTitle: 'Starter Pack',
};

const ANSWER: PackInstallAnswer = {
  status: 'ok',
  message: '1 installed, 0 already there, 0 not installed',
  stateDir: { dir: 'C:\\me\\.openclaw', skillsDir: 'C:\\me\\.openclaw\\skills', source: 'home', home: '', exists: true, note: '' },
  requested: 1,
  installed: 1,
  replaced: 0,
  alreadyInstalled: 0,
  refused: 0,
  failed: 0,
  results: [
    {
      id: 'network-basics',
      name: 'network-basics',
      type: 'claw-memory',
      pack: 'starter-pack',
      version: '1.0.0',
      cid: 'bafkrei1',
      status: 'installed',
      code: '',
      message: 'installed network-basics 1.0.0 into skills/network-basics',
      path: 'skills/network-basics',
      files: 2,
      bytes: 7183,
      touches: '',
      wants: null,
    },
  ],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client.installPackItems.mockReset();
});

describe('installing one gallery asset', () => {
  it('says which pack it is from and what it writes, then installs it by CID', async () => {
    client.installPackItems.mockResolvedValue(ANSWER);
    render(<AssetPackInstall item={ITEM} mode="ready" installed={false} />, { wrapper });

    expect(screen.getByTestId('asset-pack-install-network-basics')).toHaveTextContent('In Starter Pack.');
    expect(screen.getByTestId('asset-pack-install-network-basics')).toHaveTextContent(
      'Writes <state>/skills/network-basics/ (2 files).',
    );

    fireEvent.click(screen.getByTestId('asset-pack-install-button-network-basics'));

    await waitFor(() => expect(client.installPackItems.mock.calls[0][0]).toEqual({ cid: 'bafkrei1' }));
    expect(await screen.findByTestId('asset-pack-status-network-basics')).toHaveTextContent('Installed');
    expect(screen.getByTestId('asset-pack-message-network-basics')).toHaveTextContent('into skills/network-basics');
  });

  it('states an item the agent already has instead of offering it again', () => {
    render(<AssetPackInstall item={ITEM} mode="ready" installed />, { wrapper });
    expect(screen.getByTestId('asset-pack-installed-network-basics')).toHaveTextContent('Installed');
    expect(screen.queryByTestId('asset-pack-install-button-network-basics')).not.toBeInTheDocument();
  });

  it('shows no button at all without an agent, and a disabled one with a reason while it cannot install', () => {
    const { rerender } = render(<AssetPackInstall item={ITEM} mode="unavailable" installed={false} />, { wrapper });
    expect(screen.queryByTestId('asset-pack-install-button-network-basics')).not.toBeInTheDocument();

    rerender(<AssetPackInstall item={ITEM} mode="blocked" blockedReason="The command tools are still finishing." installed={false} />);
    const button = screen.getByTestId('asset-pack-install-button-network-basics');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'The command tools are still finishing.');
  });

  it('shows a refusal in the words the agent sent', async () => {
    client.installPackItems.mockResolvedValue({
      ...ANSWER,
      installed: 0,
      refused: 1,
      results: [
        {
          ...ANSWER.results[0],
          status: 'refused',
          code: 'NAME_SHADOWS_BUNDLED',
          message: 'your agent already ships a skill called github',
        },
      ],
    });
    render(<AssetPackInstall item={ITEM} mode="ready" installed={false} />, { wrapper });

    fireEvent.click(screen.getByTestId('asset-pack-install-button-network-basics'));

    expect(await screen.findByTestId('asset-pack-status-network-basics')).toHaveTextContent('Not installed');
    expect(screen.getByTestId('asset-pack-message-network-basics')).toHaveTextContent('already ships a skill called github');
  });

  it('shows a whole request failure as an alert', async () => {
    client.installPackItems.mockRejectedValue(new ApiRequestError(0, { code: 'NETWORK_ERROR', message: "Can't reach your agent." }));
    render(<AssetPackInstall item={ITEM} mode="ready" installed={false} />, { wrapper });

    fireEvent.click(screen.getByTestId('asset-pack-install-button-network-basics'));

    expect(await screen.findByTestId('asset-pack-error-network-basics')).toHaveTextContent("Can't reach your agent.");
  });
});
