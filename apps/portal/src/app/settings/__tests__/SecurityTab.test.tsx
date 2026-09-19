/**
 * Purpose: Settings > Security: the blocked list is the agent's own (useBlockedPeers), each
 *          row unblocks through useUnblockPeer, Add validates the id and blocks through
 *          useBlockPeer, and the invented verification and reputation controls are gone.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '@/providers/I18nProvider';

const mockDaemon = vi.hoisted(() => ({
  connected: true,
  health: { peerId: '12D3KooWSelfSelfSelfSelfSelfSelfSelfSelfSelfSelfSelf1' },
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const peers = vi.hoisted(() => ({
  blocked: { data: undefined as { peer_ids: string[] } | undefined, isLoading: false, isError: false },
  block: vi.fn(),
  unblock: vi.fn(),
}));
vi.mock('@/lib/api/hooks/use-peers', () => ({
  useBlockedPeers: () => peers.blocked,
  useBlockPeer: () => ({ mutate: peers.block, isPending: false }),
  useUnblockPeer: () => ({ mutate: peers.unblock, isPending: false }),
}));

import { SecurityTab, looksLikePeerId, PEER_ID_INVALID } from '../_components/SecurityTab';

const BLOCKED_A = '12D3KooWAaaaAaaaAaaaAaaaAaaaAaaaAaaaAaaaAaaaAaaaAaa1';
const BLOCKED_B = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const NEW_ID = '12D3KooWBbbbBbbbBbbbBbbbBbbbBbbbBbbbBbbbBbbbBbbbBbb2';

function renderTab() {
  return render(<SecurityTab />, { wrapper: I18nProvider });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  peers.blocked.data = { peer_ids: [BLOCKED_A, BLOCKED_B] };
  peers.blocked.isLoading = false;
  peers.blocked.isError = false;
});

describe('looksLikePeerId', () => {
  it('accepts Ed25519 and legacy multihash ids, refuses everything else', () => {
    expect(looksLikePeerId(BLOCKED_A)).toBe(true);
    expect(looksLikePeerId(BLOCKED_B)).toBe(true);
    expect(looksLikePeerId(` ${NEW_ID} `)).toBe(true);
    expect(looksLikePeerId('alice')).toBe(false);
    expect(looksLikePeerId('12D3KooW')).toBe(false);
    expect(looksLikePeerId('12D3KooW0OIl' + 'a'.repeat(44))).toBe(false);
    expect(looksLikePeerId('')).toBe(false);
  });
});

describe('SecurityTab blocked list', () => {
  it('lists the agent blocked ids with an Unblock per row', () => {
    renderTab();
    const rows = screen.getAllByTestId('settings-blocklist-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(BLOCKED_A.slice(0, 16));
    fireEvent.click(rows[1].querySelector('[data-testid="settings-blocklist-unblock"]')!);
    expect(peers.unblock).toHaveBeenCalledWith(BLOCKED_B, expect.any(Object));
  });

  it('blocks a valid id through useBlockPeer and clears the input on success', () => {
    peers.block.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    renderTab();
    const input = screen.getByTestId('settings-block-input') as HTMLInputElement;
    expect(screen.getByTestId('settings-block-add')).toBeDisabled();
    fireEvent.change(input, { target: { value: ` ${NEW_ID} ` } });
    fireEvent.click(screen.getByTestId('settings-block-add'));
    expect(peers.block).toHaveBeenCalledWith(NEW_ID, expect.any(Object));
    expect(input.value).toBe('');
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Agent blocked', variant: 'success' }));
  });

  it('refuses something that is not a peer id, and the agent own id, without calling the agent', () => {
    renderTab();
    const input = screen.getByTestId('settings-block-input');
    fireEvent.change(input, { target: { value: 'not-a-peer' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('settings-block-invalid')).toHaveTextContent(PEER_ID_INVALID);
    expect(peers.block).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: mockDaemon.health.peerId } });
    expect(screen.queryByTestId('settings-block-invalid')).toBeNull();
    fireEvent.click(screen.getByTestId('settings-block-add'));
    expect(screen.getByTestId('settings-block-invalid')).toBeInTheDocument();
    expect(peers.block).not.toHaveBeenCalled();
  });

  it('toasts a refusal from the agent', () => {
    peers.block.mockImplementation((_id: string, opts: { onError: (e: Error) => void }) => opts.onError(new Error('rate limited')));
    renderTab();
    fireEvent.change(screen.getByTestId('settings-block-input'), { target: { value: NEW_ID } });
    fireEvent.click(screen.getByTestId('settings-block-add'));
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', description: 'rate limited' }));
  });

  it('shows an empty state with nothing blocked', () => {
    peers.blocked.data = { peer_ids: [] };
    renderTab();
    expect(screen.getByTestId('settings-blocklist-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('settings-blocklist-row')).toHaveLength(0);
  });

  it('is inert with the agent notice offline', () => {
    mockDaemon.connected = false;
    renderTab();
    expect(screen.getByTestId('settings-block-input')).toBeDisabled();
    expect(screen.getByTestId('settings-block-add')).toBeDisabled();
    expect(screen.getByTestId('settings-blocklist-agent-required')).toBeInTheDocument();
    expect(screen.queryAllByTestId('settings-blocklist-row')).toHaveLength(0);
  });
});

describe('SecurityTab removed controls', () => {
  it('states CID verification is always on and has no toggles, reputation slider or textarea', () => {
    renderTab();
    expect(screen.getByTestId('settings-verification-note')).toHaveTextContent(/always on/);
    expect(screen.queryByTestId('settings-safetensors')).toBeNull();
    expect(screen.queryByTestId('settings-cosine-checks')).toBeNull();
    expect(screen.queryByTestId('settings-cid-verify')).toBeNull();
    expect(screen.queryByTestId('settings-verified-only')).toBeNull();
    expect(screen.queryByTestId('settings-min-rep')).toBeNull();
    expect(screen.queryByTestId('settings-min-rep-slider')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });
});
