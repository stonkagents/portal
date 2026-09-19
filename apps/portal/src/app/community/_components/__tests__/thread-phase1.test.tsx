/**
 * Purpose: Phase 1 in the thread: the accepted reply is pinned under the post
 *          with a check; the author sees Accept answer and, on a token-offer
 *          post, Pay <amount> <symbol> per reply (greyed with the reason when
 *          the replier has no wallet or was paid); Report sits in the "..."
 *          menu of posts and replies with a reason picker; Watch toggles;
 *          Pin / Hide only show for a platform peer; hidden content tells its
 *          author; mentions link to the agent's activity view.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Post } from '@/lib/types/community';
import type * as PayHooks from '@/lib/api/hooks/use-pay-token-offer';

const daemonFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/daemon-fetch', () => ({ daemonFetch }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true, health: { peerId: 'me' } }) }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn(), dismissToast: vi.fn(), toasts: [] }) }));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  AgentRequiredNotice: () => null,
  useAgentRequired: () => ({ connected: true, required: false, title: undefined }),
}));
vi.mock('../ThreadCompose', () => ({ ThreadCompose: () => null }));
const walletState = vi.hoisted(() => ({ connected: true, publicKey: 'WalletMe' as string | null }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => walletState }));

const peers = vi.hoisted(() => ({ platform: false, me: { peerId: 'me', walletAddress: 'WalletMe' as string | null } as { peerId: string; walletAddress: string | null } | null, fetched: true, failed: false }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({
  useIsPlatformPeer: () => peers.platform,
  usePeerMe: () => ({ data: peers.me, isFetched: peers.fetched, isError: peers.failed }),
}));

const mutations = vi.hoisted(() => ({
  accept: vi.fn(),
  report: vi.fn(),
  watch: vi.fn(),
  pin: vi.fn(),
  hide: vi.fn(),
  pay: vi.fn(async () => {}),
  record: vi.fn(async () => {}),
}));
const payState = vi.hoisted(() => ({ pending: {} as Record<string, { signature: string; at: string }> }));
vi.mock('@/lib/api/hooks/use-board-thread', () => ({
  useAcceptReply: () => ({ mutate: mutations.accept, isPending: false }),
  useReportContent: () => ({ mutate: mutations.report, isPending: false }),
  useWatchPost: () => ({ mutate: mutations.watch, isPending: false }),
  useEditPost: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useDeletePost: () => ({ mutate: vi.fn(), isPending: false }),
  useEditReply: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useDeleteReply: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/api/hooks/use-board-platform', () => ({
  usePinPost: () => ({ mutate: mutations.pin, isPending: false }),
  useHideContent: () => ({ mutate: mutations.hide, isPending: false }),
}));
vi.mock('@/lib/api/hooks/use-pay-token-offer', async importOriginal => ({
  ...(await importOriginal<typeof PayHooks>()),
  usePayTokenOffer: () => ({ status: 'idle', replyId: null, error: null, pending: payState.pending, pay: mutations.pay, record: mutations.record, reset: vi.fn() }),
}));

import { ThreadPanel } from '../ThreadPanel';

const post: Post = {
  id: 'p1',
  author: 'me',
  authorType: 'agent',
  authorTier: 'gold',
  authorReputationTier: 'trusted',
  timestamp: '2h ago',
  body: 'who has it? cc @alice',
  tags: [],
  upvotes: 0,
  commentCount: 3,
  category: 'token-offer',
  viewCount: 0,
  isAuthor: true,
  acceptedReplyId: 'r-accepted',
  hidden: false,
  pinned: false,
  watching: false,
  mentions: [{ peerId: 'peer-alice', displayName: 'alice' }],
  room: null,
  roomPinned: false,
  routedCount: 0,
  tokenOffer: { mint: 'Mint111', symbol: 'STONK', decimals: 6, amount: 1_500_000, max: 10, paid: 3 },
};

const RAW = [
  { id: 'r-old', postId: 'p1', author: 'peer-a', content: 'first', time: '1h ago', author_wallet: 'WalletA' },
  { id: 'r-accepted', postId: 'p1', author: 'peer-b', content: 'the answer', time: '50m ago', accepted: true, author_wallet: 'WalletB', token_offer_paid: true },
  { id: 'r-nowallet', postId: 'p1', author: 'peer-c', content: 'no wallet here', time: '10m ago', author_wallet: null },
];

function renderPanel(p: Post = post) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<ThreadPanel post={p} open onClose={() => {}} />, { wrapper: Wrapper });
}

beforeEach(() => {
  daemonFetch.mockReset();
  daemonFetch.mockImplementation(async () => RAW);
  peers.platform = false;
  peers.me = { peerId: 'me', walletAddress: 'WalletMe' };
  peers.fetched = true;
  peers.failed = false;
  walletState.connected = true;
  walletState.publicKey = 'WalletMe';
  payState.pending = {};
  Object.values(mutations).forEach(m => m.mockClear());
});

describe('accepted answer', () => {
  it('pins the accepted reply under the post with a check and keeps it out of the sorted list', async () => {
    renderPanel();
    const pinned = await screen.findByTestId('thread-accepted');
    expect(within(pinned).getByTestId('reply-r-accepted-accepted')).toHaveTextContent('Accepted');
    expect(within(pinned).getByTestId('reply-r-accepted-paid')).toHaveTextContent('Paid');
    expect(screen.getAllByTestId('reply-r-accepted')).toHaveLength(1);
    expect(screen.getByTestId('thread-post-author-tier')).toHaveTextContent('Trusted');
  });

  it('lets the author accept another reply instead, and never their own', async () => {
    renderPanel();
    await screen.findByTestId('thread-accepted');
    expect(screen.queryByTestId('accept-reply-r-accepted')).toBeNull();
    fireEvent.click(screen.getByTestId('accept-reply-r-old'));
    expect(mutations.accept).toHaveBeenCalledWith({ postId: 'p1', replyId: 'r-old' });
    expect(screen.getByTestId('accept-reply-r-old')).toHaveTextContent('Accept instead');
  });
});

describe('token offer payment', () => {
  it('offers Pay <amount> <symbol> on a reply with a wallet and greys the others with a reason', async () => {
    renderPanel();
    const pay = await screen.findByTestId('pay-offer-r-old');
    expect(pay).toHaveTextContent('Pay 1.5 STONK');
    expect(pay).toBeEnabled();
    fireEvent.click(pay);
    expect(mutations.pay).toHaveBeenCalledWith({ post, reply: expect.objectContaining({ id: 'r-old', authorWallet: 'WalletA' }) });

    const noWallet = screen.getByTestId('pay-offer-r-nowallet');
    expect(noWallet).toBeDisabled();
    expect(noWallet).toHaveAttribute('title', 'The replier has not linked a wallet yet.');
    const paid = screen.getByTestId('pay-offer-r-accepted');
    expect(paid).toBeDisabled();
    expect(paid).toHaveAttribute('title', 'This reply was already paid.');
    expect(screen.getByTestId('thread-post-offer-paid')).toHaveTextContent('3 of 10 paid');
  });

  it('greys Pay when the author has no linked wallet, the linked wallet is unknown, or another wallet is connected', async () => {
    peers.me = { peerId: 'me', walletAddress: null };
    const { unmount } = renderPanel();
    let pay = await screen.findByTestId('pay-offer-r-old');
    expect(pay).toBeDisabled();
    expect(pay).toHaveAttribute('title', 'Link a wallet in Settings before paying.');
    fireEvent.click(pay);
    expect(mutations.pay).not.toHaveBeenCalled();
    unmount();

    peers.me = { peerId: 'me', walletAddress: 'WalletLinked1111111111111111111111111111111' };
    walletState.publicKey = 'WalletOther';
    const second = renderPanel();
    pay = await screen.findByTestId('pay-offer-r-old');
    expect(pay).toBeDisabled();
    expect(pay).toHaveAttribute('title', 'Connect the wallet linked to this agent: Wallet...11111');
    second.unmount();

    peers.me = null;
    peers.fetched = false;
    renderPanel();
    pay = await screen.findByTestId('pay-offer-r-old');
    expect(pay).toBeDisabled();
    expect(pay).toHaveAttribute('title', 'Checking your linked wallet...');
  });

  it('offers Record payment instead of Pay for a transfer that went out but was not recorded, and a manual signature input', async () => {
    payState.pending = { 'r-old': { signature: 'SIGPENDING', at: '2026-09-16T10:00:00Z' } };
    renderPanel();
    const row = await screen.findByTestId('record-offer-r-old');
    expect(row).toHaveTextContent('Payment sent, not yet recorded');
    expect(screen.queryByTestId('pay-offer-r-old')).toBeNull();
    fireEvent.click(screen.getByTestId('record-offer-r-old-send'));
    expect(mutations.record).toHaveBeenCalledWith({ post, reply: expect.objectContaining({ id: 'r-old' }), signature: 'SIGPENDING' });
    expect(mutations.pay).not.toHaveBeenCalled();

    /* A reply with no pending transfer keeps Pay and folds the manual input behind a link. */
    fireEvent.click(screen.getByTestId('record-offer-r-nowallet-open'));
    const input = screen.getByTestId('record-offer-r-nowallet-signature');
    const sig = '5'.repeat(88);
    fireEvent.change(input, { target: { value: sig } });
    fireEvent.click(screen.getByTestId('record-offer-r-nowallet-manual-send'));
    expect(mutations.record).toHaveBeenCalledWith({ post, reply: expect.objectContaining({ id: 'r-nowallet' }), signature: sig });

    /* A paid reply has nothing to record. */
    expect(screen.queryByTestId('record-offer-r-accepted')).toBeNull();
  });

  it('offers no signature input once the offer is used up', async () => {
    renderPanel({ ...post, tokenOffer: { ...post.tokenOffer!, paid: 10, max: 10 } });
    await screen.findByTestId('pay-offer-r-old');
    expect(screen.queryByTestId('record-offer-r-old')).toBeNull();
    expect(screen.queryByTestId('record-offer-r-nowallet')).toBeNull();
  });

  it('shows nothing to a reader who is not the author', async () => {
    renderPanel({ ...post, isAuthor: false, author: 'someone-else' });
    await screen.findByTestId('reply-r-old');
    expect(screen.queryByTestId('pay-offer-r-old')).toBeNull();
    expect(screen.queryByTestId('accept-reply-r-old')).toBeNull();
  });
});

describe('report, watch, mentions', () => {
  it('reports a reply with a reason and a note from its menu', async () => {
    renderPanel();
    await screen.findByTestId('reply-r-old');
    fireEvent.click(screen.getByTestId('reply-r-old-menu'));
    fireEvent.click(screen.getByTestId('reply-r-old-menu-report'));
    fireEvent.click(screen.getByTestId('reply-r-old-report-scam'));
    fireEvent.change(screen.getByTestId('reply-r-old-report-note'), { target: { value: 'fake link' } });
    fireEvent.click(screen.getByTestId('reply-r-old-report-send'));
    expect(mutations.report).toHaveBeenCalledWith({ target: 'reply', id: 'r-old', reason: 'scam', note: 'fake link' });
    expect(screen.queryByTestId('reply-r-old-menu-list')).toBeNull();
  });

  it('offers Edit and Delete on your own post, never Report (round 2)', async () => {
    renderPanel();
    await screen.findByTestId('reply-r-old');
    fireEvent.click(screen.getByTestId('thread-post-menu'));
    expect(screen.getByTestId('thread-post-menu-edit')).toBeInTheDocument();
    expect(screen.getByTestId('thread-post-menu-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('thread-post-menu-report')).toBeNull();
  });

  it('toggles watching', async () => {
    renderPanel();
    const watch = await screen.findByTestId('thread-watch');
    expect(watch).toHaveTextContent('Watch');
    fireEvent.click(watch);
    expect(mutations.watch).toHaveBeenCalledWith({ postId: 'p1', watch: true });
  });

  it('links a resolved mention to the agent activity view', async () => {
    renderPanel();
    const link = await screen.findByTestId('mention-peer-alice');
    expect(link).toHaveTextContent('@alice');
    expect(link).toHaveAttribute('href', '/community?agent=peer-alice');
  });
});

describe('platform peer', () => {
  it('gets Pin and Hide on the post and Hide on replies, and a hidden note reads as such', async () => {
    peers.platform = true;
    renderPanel({ ...post, isAuthor: false, author: 'someone-else', hidden: true, pinned: true });
    await screen.findByTestId('reply-r-old');
    expect(screen.getByTestId('thread-post-hidden')).toHaveTextContent('Hidden after reports. Visible to its author and platform peers.');
    expect(screen.getByTestId('thread-post-pinned')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('thread-post-menu'));
    expect(screen.getByTestId('thread-post-menu-report')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('thread-post-menu-pin'));
    expect(mutations.pin).toHaveBeenCalledWith({ postId: 'p1', pin: false });
    fireEvent.click(screen.getByTestId('thread-post-menu'));
    fireEvent.click(screen.getByTestId('thread-post-menu-hide'));
    expect(mutations.hide).toHaveBeenCalledWith({ target: 'post', id: 'p1', postId: 'p1', hide: false });

    fireEvent.click(screen.getByTestId('reply-r-old-menu'));
    fireEvent.click(screen.getByTestId('reply-r-old-menu-hide'));
    expect(mutations.hide).toHaveBeenCalledWith({ target: 'reply', id: 'r-old', postId: 'p1', hide: true });
  });

  it('reads the thread through the agent', async () => {
    renderPanel();
    await waitFor(() => expect(daemonFetch).toHaveBeenCalledWith('/board/posts/p1/replies'));
  });
});

describe('hidden note wording', () => {
  it('speaks to the author of a hidden post and reply', async () => {
    daemonFetch.mockImplementation(async () => [{ id: 'r-mine', postId: 'p1', author: 'me', content: 'mine', time: '1h ago', hidden: true }]);
    renderPanel({ ...post, hidden: true });
    expect(await screen.findByTestId('reply-r-mine-hidden')).toHaveTextContent('Hidden after reports. Only you and platform peers see it.');
    expect(screen.getByTestId('thread-post-hidden')).toHaveTextContent('Only you and platform peers see it.');
  });
});
