/**
 * Purpose: Tests for CuratedPacks: the catalog states (skeleton, error, empty), the item
 *          list on click, and the install: offline (no dead button), the command tools
 *          still finishing, an agent that predates packs, what is already installed, a
 *          mixed answer where one item is refused and the rest land, and a per item install.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type { TransformedPack } from '@/lib/api/transformers/gallery';
import type * as DaemonPacksModule from '@/lib/api/daemon-packs';
import type { InstalledPacksAnswer, PackInstallAnswer, PackInstallResult } from '@/lib/api/daemon-packs';
import { ApiRequestError } from '@/lib/api/errors';

const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const client = vi.hoisted(() => ({
  getInstalledPackItems: vi.fn(),
  installPackItems: vi.fn(),
  removeInstalledPackItem: vi.fn(),
}));
vi.mock('@/lib/api/daemon-packs', async importOriginal => {
  const actual = await importOriginal<typeof DaemonPacksModule>();
  return { ...actual, ...client };
});

import { CuratedPacks } from '../CuratedPacks';
import { PACK_NOTHING_RUNS, PACK_UNSUPPORTED } from '@/lib/utils/pack-install';

const STATE_DIR = {
  dir: 'D:\\home\\.openclaw',
  skillsDir: 'D:\\home\\.openclaw\\skills',
  source: 'home',
  home: 'C:\\Users\\me',
  exists: true,
  note: '',
};

function item(over: Partial<TransformedPack['items'][number]> = {}) {
  return {
    id: 'network-basics',
    filename: 'network-basics.claw-memory.json',
    type: 'claw-memory',
    title: 'How the network works',
    description: 'Peers, the tracker, CIDs.',
    version: '1.0.0',
    cid: 'bafkrei1',
    size: 8176,
    touches: 'Writes <state>/skills/network-basics/ (2 files). Nothing else on the machine changes.',
    packId: 'pk1',
    packTitle: 'Starter Pack',
    ...over,
  };
}

const packs: TransformedPack[] = [
  {
    id: 'pk1',
    icon: 'zap',
    color: 'green',
    title: 'Starter Pack',
    description: 'Desc',
    assets: 2,
    items: [
      item(),
      item({ id: 'daemon-api', filename: 'daemon-api.claw-skill.json', type: 'claw-skill', title: 'Your node API', cid: 'bafkrei2' }),
    ],
  },
  { id: 'pk2', icon: 'bar-chart', color: 'blue', title: 'DeFi Pack', description: 'Desc', assets: 0, items: [] },
];

function installedAnswer(over: Partial<InstalledPacksAnswer> = {}): InstalledPacksAnswer {
  return { status: 'ok', message: '', stateDir: STATE_DIR, items: [], ...over };
}

function result(over: Partial<PackInstallResult> = {}): PackInstallResult {
  return {
    id: 'network-basics',
    name: 'network-basics',
    type: 'claw-memory',
    pack: 'pk1',
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
    ...over,
  };
}

function installAnswer(results: PackInstallResult[], over: Partial<PackInstallAnswer> = {}): PackInstallAnswer {
  return {
    status: 'ok',
    message: `${results.filter(r => r.status === 'installed').length} installed, 0 already there, ${results.filter(r => r.status === 'refused' || r.status === 'failed').length} not installed`,
    stateDir: STATE_DIR,
    requested: results.length,
    installed: results.filter(r => r.status === 'installed').length,
    replaced: 0,
    alreadyInstalled: 0,
    refused: results.filter(r => r.status === 'refused').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
}

function renderPacks(props: Partial<Parameters<typeof CuratedPacks>[0]> = {}) {
  return render(<CuratedPacks packs={packs} {...props} />, { wrapper });
}

beforeEach(() => {
  mockDaemon.connected = true;
  client.getInstalledPackItems.mockReset().mockResolvedValue(installedAnswer());
  client.installPackItems.mockReset();
});

describe('CuratedPacks catalog', () => {
  it('shows all packs when activeFilter is "All" or undefined', async () => {
    renderPacks({ activeFilter: 'All' });
    expect(screen.getByText('Starter Pack')).toBeInTheDocument();
    expect(screen.getByText('DeFi Pack')).toBeInTheDocument();
    await waitFor(() => expect(client.getInstalledPackItems).toHaveBeenCalled());
  });

  it('dims packs when a type filter is active', () => {
    renderPacks({ activeFilter: '.claw-workflow' });
    expect(screen.getByTestId('pack-pk1').className).toContain('opacity-40');
  });

  it('shows the item count and no install or size figures', () => {
    renderPacks();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.queryByText(/installs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MB/)).not.toBeInTheDocument();
  });

  it('expands a pack to list its items with the user-facing type label and what installing writes', () => {
    renderPacks();
    expect(screen.queryByTestId('pack-items-pk1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    const list = screen.getByTestId('pack-items-pk1');
    expect(list).toHaveTextContent('How the network works');
    expect(list).toHaveTextContent('.agent-memory');
    expect(screen.getByTestId('pack-item-touches-network-basics')).toHaveTextContent('Writes <state>/skills/network-basics/');

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    expect(screen.queryByTestId('pack-items-pk1')).not.toBeInTheDocument();
  });

  it('renders a skeleton while the catalog loads, a note when it failed, and an empty state', () => {
    const { rerender } = render(<CuratedPacks packs={[]} loading />, { wrapper });
    expect(screen.getAllByTestId('pack-skeleton').length).toBeGreaterThan(0);

    rerender(<CuratedPacks packs={[]} error />);
    expect(screen.getByTestId('packs-error')).toBeInTheDocument();

    rerender(<CuratedPacks packs={[]} />);
    expect(screen.getByTestId('packs-empty')).toBeInTheDocument();
  });

  it('says that nothing in a pack is run, and no longer calls the section a preview', () => {
    renderPacks();
    expect(screen.getByTestId('packs-nothing-runs')).toHaveTextContent(PACK_NOTHING_RUNS);
    expect(screen.queryByTestId('packs-coming-soon')).not.toBeInTheDocument();
    expect(screen.queryByText('preview')).not.toBeInTheDocument();
  });
});

describe('the install, and the states that stop it', () => {
  it('offline: says so, points at the install page, and shows no install button', async () => {
    mockDaemon.connected = false;
    renderPacks();

    expect(screen.getByTestId('packs-offline')).toBeInTheDocument();
    expect(screen.getByTestId('agent-required-setup-link')).toBeInTheDocument();
    expect(screen.queryByTestId('pack-install-pk1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    expect(screen.queryByTestId('pack-item-install-network-basics')).not.toBeInTheDocument();
    expect(client.getInstalledPackItems).not.toHaveBeenCalled();
  });

  it('not ready: shows the sentence the agent sent and disables the button', async () => {
    client.getInstalledPackItems.mockResolvedValue(
      installedAnswer({
        status: 'not_ready',
        message: 'The command tools are still finishing, so nothing has been installed; try again in a few minutes.',
        stateDir: { ...STATE_DIR, exists: false },
      }),
    );
    renderPacks();

    const notice = await screen.findByTestId('packs-not-ready');
    expect(notice).toHaveTextContent('command tools are still finishing');
    expect(screen.getByTestId('pack-install-pk1')).toBeDisabled();
    expect(screen.queryByTestId('packs-destination')).not.toBeInTheDocument();
  });

  it('an agent that predates packs: says to update it', async () => {
    client.getInstalledPackItems.mockRejectedValue(new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Route not found' }));
    renderPacks();

    expect(await screen.findByTestId('packs-unsupported')).toHaveTextContent(PACK_UNSUPPORTED);
    expect(screen.getByTestId('pack-install-pk1')).toBeDisabled();
  });

  it('an unreachable agent: shows the transport message, not a spinner', async () => {
    client.getInstalledPackItems.mockRejectedValue(
      new ApiRequestError(0, { code: 'NETWORK_ERROR', message: "Can't reach your agent." }),
    );
    renderPacks();

    expect(await screen.findByTestId('packs-unreachable')).toHaveTextContent("Can't reach your agent.");
  });

  it('says where the files land once the agent has answered', async () => {
    renderPacks();
    expect(await screen.findByTestId('packs-destination')).toHaveTextContent('D:\\home\\.openclaw\\skills');
  });

  it('does not offer what the agent already has', async () => {
    client.getInstalledPackItems.mockResolvedValue(
      installedAnswer({
        items: [
          {
            id: 'network-basics',
            name: 'network-basics',
            type: 'claw-memory',
            pack: 'pk1',
            version: '1.0.0',
            title: 'How the network works',
            description: '',
            cid: 'bafkrei1',
            sha256: 'abc',
            installedAt: '2026-09-23T09:03:43Z',
            paths: ['skills/network-basics/SKILL.md'],
            wants: null,
          },
        ],
      }),
    );
    renderPacks();

    expect(await screen.findByTestId('pack-installed-count-pk1')).toHaveTextContent('1 installed');
    expect(screen.getByTestId('pack-install-pk1')).toHaveTextContent('Install 1 remaining');

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    expect(screen.getByTestId('pack-item-installed-network-basics')).toHaveTextContent('Installed');
    expect(screen.queryByTestId('pack-item-install-network-basics')).not.toBeInTheDocument();
    expect(screen.getByTestId('pack-item-install-daemon-api')).toBeInTheDocument();
  });

  it('renders every row of a mixed answer with the message the agent sent', async () => {
    client.installPackItems.mockResolvedValue(
      installAnswer([
        result(),
        result({
          id: 'daemon-api',
          status: 'refused',
          code: 'NAME_IN_USE',
          message: 'a skill directory named daemon-api is already there and this agent did not install it',
        }),
      ]),
    );
    renderPacks();
    await screen.findByTestId('packs-destination');

    fireEvent.click(screen.getByTestId('pack-install-pk1'));

    expect(await screen.findByTestId('pack-item-status-network-basics')).toHaveTextContent('Installed');
    expect(screen.getByTestId('pack-item-status-daemon-api')).toHaveTextContent('Not installed');
    expect(screen.getByTestId('pack-item-message-daemon-api')).toHaveTextContent('already there and this agent did not install it');
    expect(screen.getByTestId('pack-summary-pk1')).toHaveTextContent('1 installed');
    expect(client.installPackItems.mock.calls[0][0]).toEqual({ items: ['network-basics', 'daemon-api'], replace: false });
  });

  it('installs one item on its own, and offers a replace only when a version differs', async () => {
    client.installPackItems.mockResolvedValueOnce(
      installAnswer([
        result({ status: 'refused', code: 'VERSION_DIFFERS', message: 'version 1.0.1 is installed; ask again to replace it' }),
      ]),
    );
    renderPacks();
    await screen.findByTestId('packs-destination');

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    fireEvent.click(screen.getByTestId('pack-item-install-network-basics'));

    expect(await screen.findByTestId('pack-item-message-network-basics')).toHaveTextContent('version 1.0.1 is installed');
    expect(client.installPackItems.mock.calls[0][0]).toEqual({ items: ['network-basics'], replace: false });

    client.installPackItems.mockResolvedValueOnce(installAnswer([result({ status: 'replaced', message: 'replaced network-basics' })]));
    fireEvent.click(screen.getByTestId('pack-item-replace-network-basics'));

    await waitFor(() => expect(client.installPackItems.mock.calls[1]?.[0]).toEqual({ items: ['network-basics'], replace: true }));
    expect(await screen.findByTestId('pack-item-status-network-basics')).toHaveTextContent('Replaced');
  });

  it('shows what an installed item wants, and never says it was run', async () => {
    client.installPackItems.mockResolvedValue(installAnswer([result({ wants: { bins: ['gh'], os: [], installHooks: true } })]));
    renderPacks();
    await screen.findByTestId('packs-destination');

    fireEvent.click(screen.getByTestId('pack-install-pk1'));

    const wants = await screen.findAllByTestId('pack-item-wants-network-basics');
    expect(wants[0]).toHaveTextContent('Wants the program gh on the machine. We do not install it or run it.');
    expect(wants[1]).toHaveTextContent('Declares an install step. Installing it here does not run that step.');
  });

  it('a whole request that failed says what the agent said', async () => {
    client.installPackItems.mockRejectedValue(
      new ApiRequestError(503, { code: 'CATALOG_UNAVAILABLE', message: 'your agent could not read the pack catalog' }),
    );
    renderPacks();
    await screen.findByTestId('packs-destination');

    fireEvent.click(screen.getByTestId('pack-install-pk1'));

    expect(await screen.findByTestId('pack-error-pk1')).toHaveTextContent('could not read the pack catalog');
  });

  it('an item the catalog pins no bundle for is not offered', async () => {
    const unseeded: TransformedPack[] = [{ ...packs[0], items: [item({ cid: '' })] }];
    render(<CuratedPacks packs={unseeded} />, { wrapper });
    await screen.findByTestId('packs-destination');

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    expect(screen.getByTestId('pack-item-unavailable-network-basics')).toHaveTextContent('Not on the network yet');
    expect(screen.queryByTestId('pack-item-install-network-basics')).not.toBeInTheDocument();
    expect(screen.getByTestId('pack-unavailable-pk1')).toBeInTheDocument();
  });
});
