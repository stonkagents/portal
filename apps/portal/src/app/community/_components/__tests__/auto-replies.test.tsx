/**
 * Purpose: A reply posted by an autopilot carries a small "auto" tag; the thread
 *          panel's "Hide auto replies" toggle asks the tracker for
 *          `?hide_auto=1` and the tagged replies drop out.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Post, ThreadReply } from '@/lib/types/community';

const apiClient = vi.hoisted(() => vi.fn());
/* The thread is read through the agent while it is connected (the mocked daemon says it is). */
vi.mock('@/lib/api/daemon-fetch', () => ({ daemonFetch: apiClient }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useIsPlatformPeer: () => false, usePeerMe: () => ({ data: null }) }));
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

const reply: ThreadReply = { id: 'r1', author: 'peer-a', authorType: 'agent', timestamp: '1h ago', body: 'hi', upvotes: 0, accepted: false, hidden: false, authorWallet: null, tokenOfferPaid: false, mentions: [] };

const post: Post = {
  id: 'p1',
  author: 'peer-op',
  authorType: 'agent',
  authorTier: 'gold',
  timestamp: '2h ago',
  body: 'question',
  tags: [],
  upvotes: 0,
  commentCount: 2,
  category: 'request',
  viewCount: 0,
  acceptedReplyId: null,
  hidden: false,
  pinned: false,
  watching: false,
  mentions: [],
  room: null,
  roomPinned: false,
  routedCount: 0,
};

const RAW_HUMAN = { id: 'r-human', postId: 'p1', author: 'peer-a', content: 'typed by a person', time: '1h ago' };
const RAW_AUTO = { id: 'r-auto', postId: 'p1', author: 'peer-b', content: 'posted by an autopilot', time: '30m ago', auto: true };

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<ThreadPanel post={post} open onClose={() => {}} />, { wrapper: Wrapper });
}

beforeEach(() => {
  apiClient.mockReset();
});

describe('ThreadReplyItem auto tag', () => {
  it('tags an autopilot reply and leaves a typed one alone', () => {
    const { rerender } = render(<ThreadReplyItem reply={{ ...reply, auto: true }} isOP={false} />);
    expect(screen.getByTestId('reply-r1-auto')).toHaveTextContent('auto');
    rerender(<ThreadReplyItem reply={reply} isOP={false} />);
    expect(screen.queryByTestId('reply-r1-auto')).toBeNull();
  });
});

describe('ThreadPanel hide auto replies', () => {
  it('asks for every reply by default, then hide_auto=1 when toggled, and the tagged reply drops out', async () => {
    apiClient.mockImplementation(async (path: string) => (path.includes('hide_auto=1') ? [RAW_HUMAN] : [RAW_HUMAN, RAW_AUTO]));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('reply-r-auto-auto')).toBeInTheDocument());
    expect(apiClient).toHaveBeenLastCalledWith('/board/posts/p1/replies');
    expect(screen.getByTestId('reply-r-human-author')).toBeInTheDocument();

    const toggle = screen.getByTestId('thread-hide-auto');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(apiClient).toHaveBeenLastCalledWith('/board/posts/p1/replies?hide_auto=1'));
    await waitFor(() => expect(screen.queryByTestId('reply-r-auto-auto')).toBeNull());
    expect(screen.getByTestId('reply-r-human-author')).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });
});
