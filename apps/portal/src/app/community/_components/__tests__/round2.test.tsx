/**
 * Purpose: Community round 2 in the portal: the routed reason sentence, drafts and the
 *          submit shortcut, the "new since your last visit" divider placement, the
 *          tombstone and edited markers on posts and replies, Edit and Delete for the
 *          author in the thread with the in-place editor (Ctrl+Enter saves, Escape
 *          cancels), Escape closing the panel, the reply draft surviving a remount, the
 *          room switcher's unread count, and the notification preferences panel.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { BoardRoom, Post, ThreadReply } from '@/lib/types/community';
import type * as CommunityHooks from '@/lib/api/hooks/use-community';

const mutations = vi.hoisted(() => ({
  editPost: vi.fn(),
  deletePost: vi.fn(),
  editReply: vi.fn(),
  deleteReply: vi.fn(),
  reply: vi.fn(),
  setPrefs: vi.fn(),
}));
const state = vi.hoisted(() => ({ connected: true, rooms: [] as unknown[], replies: [] as unknown[], prefs: { mutedKinds: [] as string[], kinds: ['reply_on_post', 'post_upvoted'] } }));

vi.mock('@/lib/api/daemon-fetch', () => ({ daemonFetch: vi.fn(async () => []) }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({
  useIsPlatformPeer: () => false,
  usePeerMe: () => ({ data: { peerId: 'me', walletAddress: null }, isFetched: true, isError: false }),
  useDisplayNameSearch: () => ({ data: [] }),
}));
vi.mock('@/lib/api/hooks/use-board-thread', () => ({
  useAcceptReply: () => ({ mutate: vi.fn(), isPending: false }),
  useReportContent: () => ({ mutate: vi.fn(), isPending: false }),
  useWatchPost: () => ({ mutate: vi.fn(), isPending: false }),
  useEditPost: () => ({ mutate: mutations.editPost, isPending: false, isSuccess: false }),
  useDeletePost: () => ({ mutate: mutations.deletePost, isPending: false }),
  useEditReply: () => ({ mutate: mutations.editReply, isPending: false, isSuccess: false }),
  useDeleteReply: () => ({ mutate: mutations.deleteReply, isPending: false }),
}));
vi.mock('@/lib/api/hooks/use-board-platform', () => ({
  usePinPost: () => ({ mutate: vi.fn(), isPending: false }),
  useHideContent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/api/hooks/use-pay-token-offer', () => ({
  usePayTokenOffer: () => ({ status: 'idle', replyId: null, error: null, pending: {}, pay: vi.fn(), record: vi.fn(), reset: vi.fn() }),
}));
vi.mock('@/lib/api/hooks/use-community', async importOriginal => ({
  ...(await importOriginal<typeof CommunityHooks>()),
  useThread: () => ({ data: state.replies, isLoading: false, isError: false, failureCount: 0 }),
  useReplyToThread: () => ({ mutate: mutations.reply, isPending: false, isSuccess: false }),
}));
vi.mock('@/lib/api/hooks/use-board-rooms', () => ({
  useMyRooms: () => ({ data: state.rooms }),
  useRoom: () => ({ data: null }),
}));
vi.mock('@/lib/api/hooks/use-board-activity', () => ({
  useNotificationPrefs: () => ({ data: state.prefs, isLoading: false }),
  useSetNotificationPrefs: () => ({ mutate: mutations.setPrefs, isPending: false, isError: false }),
}));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => ({ connected: false, publicKey: null }) }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: state.connected, health: { peerId: 'me' } }) }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn(), dismissToast: vi.fn(), toasts: [] }) }));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  AgentRequiredNotice: () => null,
  useAgentRequired: () => ({ connected: state.connected, required: false, title: undefined }),
}));

import { routedReasonSentence } from '../../_lib/routed-reasons';
import { composeDraftKey, isSubmitShortcut, readDraft, replyDraftKey, writeDraft } from '../../_lib/drafts';
import { newSinceIndex } from '../NewSinceDivider';
import { ThreadPanel } from '../ThreadPanel';
import { ThreadCompose } from '../ThreadCompose';
import { ThreadReplyItem, DELETED_REPLY_TEXT } from '../ThreadReplyItem';
import { PostCard } from '../PostCard';
import { RoomSwitcher } from '../RoomSwitcher';
import { NotificationPrefsPanel } from '@/components/layout/notifications/NotificationPrefsPanel';

const basePost: Post = {
  id: 'p1',
  author: 'me',
  authorType: 'agent',
  authorTier: 'gold',
  timestamp: '2026-09-18T10:00:00Z',
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

const baseReply: ThreadReply = { id: 'r1', author: 'me', authorType: 'agent', timestamp: '1h ago', body: 'my reply', upvotes: 0, accepted: false, hidden: false, authorWallet: null, tokenOfferPaid: false, mentions: [] };

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  state.connected = true;
  state.replies = [];
  state.rooms = [];
});

describe('routed reasons', () => {
  it('turns the tracker labels into one sentence and skips unknown ones', () => {
    expect(routedReasonSentence(['category', 'tier:trusted', 'online', 'mystery'])).toBe(
      'Sent to you because your agent answers this kind of post, your board reputation is Trusted and your agent is online.',
    );
    expect(routedReasonSentence(['holder'])).toBe('Sent to you because you hold the token of this room.');
    expect(routedReasonSentence([])).toBe('');
    expect(routedReasonSentence(undefined)).toBe('');
  });
});

describe('drafts and the submit shortcut', () => {
  it('stores, reads and clears drafts per thread and room', () => {
    writeDraft(replyDraftKey('p1'), 'half a thought');
    expect(readDraft(replyDraftKey('p1'))).toBe('half a thought');
    expect(readDraft(replyDraftKey('p2'))).toBe('');
    writeDraft(replyDraftKey('p1'), '   ');
    expect(readDraft(replyDraftKey('p1'))).toBe('');
    expect(composeDraftKey('')).not.toBe(composeDraftKey('Mint111'));
  });

  it('is Ctrl+Enter or Cmd+Enter, never plain Enter', () => {
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: true })).toBe(true);
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe(false);
    expect(isSubmitShortcut({ key: 'a', ctrlKey: true, metaKey: false })).toBe(false);
  });
});

describe('new since your last visit', () => {
  const at = (iso: string, extra: Partial<Post> = {}): Post => ({ ...basePost, id: iso, timestamp: iso, ...extra });
  it('sits before the first post older than the visit, skipping pinned ones', () => {
    const posts = [at('2026-09-18T12:00:00Z', { pinned: true }), at('2026-09-18T11:00:00Z'), at('2026-09-18T10:00:00Z'), at('2026-09-18T08:00:00Z')];
    expect(newSinceIndex(posts, '2026-09-18T09:00:00Z')).toBe(3);
  });
  it('has no place without a visit, when nothing is new, or when everything is new', () => {
    const posts = [at('2026-09-18T11:00:00Z'), at('2026-09-18T10:00:00Z')];
    expect(newSinceIndex(posts, null)).toBe(-1);
    expect(newSinceIndex(posts, '2026-09-18T12:00:00Z')).toBe(-1);
    expect(newSinceIndex(posts, '2026-09-18T09:00:00Z')).toBe(-1);
  });
});

describe('tombstones and edits', () => {
  it('shows a deleted reply as a tombstone without its actions and an edited one with the marker', () => {
    wrap(<ThreadReplyItem reply={{ ...baseReply, deleted: true }} isOP={false} actions={<button>Accept</button>} />);
    expect(screen.getByTestId('reply-r1-deleted')).toHaveTextContent(DELETED_REPLY_TEXT);
    expect(screen.queryByText('Accept')).toBeNull();
    wrap(<ThreadReplyItem reply={{ ...baseReply, id: 'r2', editedAt: '2026-09-18T10:00:00Z', editCount: 1 }} isOP={false} />);
    expect(screen.getByTestId('reply-r2-edited')).toHaveTextContent('(edited)');
  });

  it('marks an edited post on the card and explains why a routed post reached the viewer', () => {
    wrap(<PostCard post={{ ...basePost, editedAt: '2026-09-18T10:00:00Z', editCount: 2, routedReasons: ['category'] }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-edited')).toHaveTextContent('(edited)');
    expect(screen.getByTestId('post-p1-routed-why')).toHaveTextContent('Sent to you because your agent answers this kind of post.');
  });

  it('lets the author edit the post in place: Ctrl+Enter saves, Escape cancels, the menu deletes', async () => {
    const onClose = vi.fn();
    wrap(<ThreadPanel post={basePost} open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('thread-post-menu'));
    fireEvent.click(screen.getByTestId('thread-post-menu-edit'));
    const box = screen.getByTestId('thread-post-editor-textarea');
    fireEvent.change(box, { target: { value: 'Need the Q3 set, updated' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(mutations.editPost).toHaveBeenCalledWith({ postId: 'p1', body: 'Need the Q3 set, updated' });
    /* Escape inside the editor only closes the editor, not the panel. */
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('thread-post-editor')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('thread-post-menu'));
    fireEvent.click(screen.getByTestId('thread-post-menu-delete'));
    expect(mutations.deletePost).toHaveBeenCalledWith('p1');
    /* With no editor open, Escape closes the thread. */
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a deleted post as a tombstone with no compose box and no Report', () => {
    wrap(<ThreadPanel post={{ ...basePost, deleted: true, isAuthor: false }} open onClose={() => {}} />);
    expect(screen.getByTestId('thread-post-deleted')).toBeInTheDocument();
    expect(screen.queryByTestId('thread-compose')).toBeNull();
    expect(screen.queryByTestId('thread-post-menu')).toBeNull();
  });

  it("offers Edit and Delete on the viewer's own reply and edits it in place", () => {
    state.replies = [{ ...baseReply }];
    wrap(<ThreadPanel post={{ ...basePost, isAuthor: false, author: 'peer-x' }} open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('reply-r1-menu'));
    fireEvent.click(screen.getByTestId('reply-r1-menu-edit'));
    const box = screen.getByTestId('reply-r1-editor-textarea');
    fireEvent.change(box, { target: { value: 'my reply, better' } });
    fireEvent.click(screen.getByTestId('reply-r1-editor-save'));
    expect(mutations.editReply).toHaveBeenCalledWith({ postId: 'p1', replyId: 'r1', body: 'my reply, better' });
  });
});

describe('reply composer', () => {
  it('keeps the draft across a remount, sends on Ctrl+Enter and clears the draft key', () => {
    const { unmount } = wrap(<ThreadCompose postId="p1" viewCount={0} />);
    fireEvent.change(screen.getByTestId('reply-textarea'), { target: { value: 'half written' } });
    unmount();
    expect(readDraft(replyDraftKey('p1'))).toBe('half written');
    wrap(<ThreadCompose postId="p1" viewCount={0} />);
    const box = screen.getByTestId('reply-textarea');
    expect(box).toHaveValue('half written');
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(mutations.reply).toHaveBeenCalledWith({ postId: 'p1', body: 'half written' });
  });
});

describe('room unread and notification preferences', () => {
  it("shows the tracker's unread count on a room chip and the local dot without one", () => {
    const room = (mint: string, extra: Partial<BoardRoom>): BoardRoom => ({
      mint, symbol: mint, name: mint, imageUrl: null, agentPeerId: null, agentDisplayName: null, posts7d: 1, membersEstimate: null, lastPostAt: '2026-09-18T10:00:00Z', role: 'holder', ...extra,
    });
    state.rooms = [room('AAA', { unread: 3 }), room('BBB', { unread: 0 }), room('CCC', {})];
    wrap(<RoomSwitcher room="" onChange={() => {}} />);
    expect(screen.getByTestId('room-AAA-unread')).toHaveTextContent('3');
    expect(screen.queryByTestId('room-BBB-unread')).toBeNull();
    expect(screen.getByTestId('room-CCC-unread')).not.toHaveTextContent(/\d/);
  });

  it('lists the kinds as switches and saves the muted set', () => {
    wrap(<NotificationPrefsPanel />);
    fireEvent.click(screen.getByTestId('notification-prefs-toggle'));
    expect(screen.getByTestId('notification-prefs-reply_on_post')).toBeChecked();
    fireEvent.click(screen.getByTestId('notification-prefs-post_upvoted'));
    expect(mutations.setPrefs).toHaveBeenCalledWith(['post_upvoted']);
  });
});
