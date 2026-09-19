/**
 * Purpose: Phase 3 in the thread: an auto reply shows its relevance value with
 *          the four signals in the tooltip; a reply with an ask says "Asks N
 *          credits"; the post author gets "Raise bounty to N" and a free amount
 *          that must beat the current bounty, both calling raise; nobody else
 *          sees the control.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Post, ThreadReply } from '@/lib/types/community';

const apiClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/daemon-fetch', () => ({ daemonFetch: apiClient }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useIsPlatformPeer: () => false, usePeerMe: () => ({ data: { peerId: 'me', walletAddress: null }, isFetched: true, isError: false }) }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => ({ connected: false, publicKey: null }) }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true, health: { peerId: 'me' } }) }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn(), dismissToast: vi.fn(), toasts: [] }) }));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  AgentRequiredNotice: () => null,
  useAgentRequired: () => ({ connected: true, required: false, title: undefined }),
}));
vi.mock('../ThreadCompose', () => ({ ThreadCompose: () => null }));

import { ThreadReplyItem } from '../ThreadReplyItem';
import { ThreadPanel } from '../ThreadPanel';
import { currentBounty, parseRaiseAmount } from '../RaiseBountyControl';
import { relevanceTitle } from '../RelevanceBadge';

const reply: ThreadReply = { id: 'r1', author: 'peer-a', authorType: 'agent', timestamp: '1h ago', body: 'hi', upvotes: 0, accepted: false, hidden: false, authorWallet: null, tokenOfferPaid: false, mentions: [] };

const post: Post = {
  id: 'p1',
  author: 'me',
  authorType: 'agent',
  authorTier: 'gold',
  timestamp: '2h ago',
  body: 'Need the Q3 set',
  tags: [],
  upvotes: 0,
  commentCount: 1,
  category: 'request',
  viewCount: 0,
  isAuthor: true,
  acceptedReplyId: null,
  hidden: false,
  pinned: false,
  watching: false,
  mentions: [],
  room: null,
  roomPinned: false,
  routedCount: 0,
};

const RAW_ASK = { id: 'r-ask', postId: 'p1', author: 'peer-b', content: 'I can deliver this for 60.', time: '30m ago', auto: true, ask: 60, relevance: 0.62, relevance_signals: { library: 0.8, history: 0, instruction: 1, routed: 1 } };

function renderPanel(props: { post?: Post; onRaiseBounty?: (postId: string, amount: number) => void; raising?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<ThreadPanel post={props.post ?? post} open onClose={() => {}} onRaiseBounty={props.onRaiseBounty} raisingBounty={props.raising} />, { wrapper: Wrapper });
}

beforeEach(() => {
  apiClient.mockReset();
  apiClient.mockResolvedValue([RAW_ASK]);
});

describe('ThreadReplyItem relevance and ask', () => {
  it('shows the relevance value with the signals in the tooltip, and the ask', () => {
    render(<ThreadReplyItem reply={{ ...reply, auto: true, relevance: 0.62, relevanceSignals: { library: 0.8, history: 0, instruction: 1, routed: 1 }, ask: 60 }} isOP={false} />);
    const badge = screen.getByTestId('reply-r1-relevance');
    expect(badge).toHaveTextContent('0.62');
    expect(badge).toHaveAttribute('title', expect.stringContaining('Library 0.80, History 0.00, Instruction 1.00, Routed 1.00'));
    expect(screen.getByTestId('reply-r1-ask')).toHaveTextContent('Asks 60 credits');
  });

  it('shows neither without a score or an ask', () => {
    render(<ThreadReplyItem reply={reply} isOP={false} />);
    expect(screen.queryByTestId('reply-r1-relevance')).toBeNull();
    expect(screen.queryByTestId('reply-r1-ask')).toBeNull();
  });

  it('words the tooltip without signals too', () => {
    expect(relevanceTitle(0.4)).toBe('Relevance 0.40: how relevant the post looked to the agent before drafting.');
  });
});

describe('ThreadPanel raise bounty', () => {
  it('offers the author "Raise bounty to 60" and a free amount above the current bounty, both calling raise', async () => {
    const onRaiseBounty = vi.fn();
    renderPanel({ onRaiseBounty });
    await waitFor(() => expect(screen.getByTestId('reply-r-ask-ask')).toBeInTheDocument());
    expect(screen.getByTestId('reply-r-ask-relevance')).toHaveTextContent('0.62');
    fireEvent.click(screen.getByTestId('raise-bounty-r-ask-ask'));
    expect(onRaiseBounty).toHaveBeenCalledWith('p1', 60);

    const custom = screen.getByTestId('raise-bounty-r-ask-custom');
    expect(custom).toBeDisabled();
    fireEvent.change(screen.getByTestId('raise-bounty-r-ask-amount'), { target: { value: '0' } });
    expect(custom).toBeDisabled();
    fireEvent.change(screen.getByTestId('raise-bounty-r-ask-amount'), { target: { value: '80' } });
    expect(custom).toBeEnabled();
    fireEvent.click(custom);
    expect(onRaiseBounty).toHaveBeenLastCalledWith('p1', 80);
  });

  it('drops the ask button once the bounty meets it and keeps the free amount above the bounty', async () => {
    const met: Post = { ...post, category: 'bounty', bounty: { amount: 60, currency: 'credits', daysRemaining: 5, status: 'open', extended: false, refundedAt: null } };
    renderPanel({ post: met, onRaiseBounty: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('raise-bounty-r-ask')).toBeInTheDocument());
    expect(screen.queryByTestId('raise-bounty-r-ask-ask')).toBeNull();
    expect(screen.getByTestId('raise-bounty-r-ask-amount')).toHaveAttribute('placeholder', 'Above 60');
  });

  it('shows no control to a reader who is not the author, or without the agent', async () => {
    const { unmount } = renderPanel({ post: { ...post, isAuthor: false }, onRaiseBounty: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('reply-r-ask-ask')).toBeInTheDocument());
    expect(screen.queryByTestId('raise-bounty-r-ask')).toBeNull();
    unmount();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('reply-r-ask-ask')).toBeInTheDocument());
    expect(screen.queryByTestId('raise-bounty-r-ask')).toBeNull();
  });

  it('disables both while a raise is in flight', async () => {
    renderPanel({ onRaiseBounty: vi.fn(), raising: true });
    await waitFor(() => expect(screen.getByTestId('raise-bounty-r-ask-ask')).toBeDisabled());
    expect(screen.getByTestId('raise-bounty-r-ask-amount')).toBeDisabled();
  });
});

describe('raise amount rules', () => {
  it('takes the open bounty as the floor, zero without one or once closed', () => {
    expect(currentBounty({ bounty: undefined })).toBe(0);
    expect(currentBounty({ bounty: { amount: 40, currency: 'credits', daysRemaining: 1, status: 'open', extended: false, refundedAt: null } })).toBe(40);
    expect(currentBounty({ bounty: { amount: 40, currency: 'credits', daysRemaining: 0, status: 'expired', extended: false, refundedAt: null } })).toBe(0);
  });

  it('accepts only whole credits above the floor', () => {
    expect(parseRaiseAmount('50', 40)).toBe(50);
    expect(parseRaiseAmount('40', 40)).toBeNull();
    expect(parseRaiseAmount('45.5', 40)).toBeNull();
    expect(parseRaiseAmount('', 0)).toBeNull();
    expect(parseRaiseAmount('abc', 0)).toBeNull();
  });
});
