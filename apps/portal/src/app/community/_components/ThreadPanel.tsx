/**
 * Purpose: Thread slide-over panel: the post, the accepted reply pinned under it,
 *          the sorted replies with their menus (Report; Hide for platform peers)
 *          and the author's actions (Award Bounty, Accept answer, Pay the token
 *          offer, Raise bounty under a reply with an ask), the compose form. Phase 1 actions go through their own hooks
 *          here; the page only supplies what it already owned (award, extend).
 */
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { useThread } from '@/lib/api/hooks/use-community';
import { useAcceptReply, useDeletePost, useDeleteReply, useEditPost, useEditReply, useReportContent, useWatchPost } from '@/lib/api/hooks/use-board-thread';
import { useHideContent, usePinPost } from '@/lib/api/hooks/use-board-platform';
import { useIsPlatformPeer, usePeerMe } from '@/lib/api/hooks/use-board-peers';
import { usePayTokenOffer } from '@/lib/api/hooks/use-pay-token-offer';
import { useWalletService } from '@/lib/wallet';
import { useDaemon } from '@/providers/DaemonProvider';
import { ThreadReplyItem } from './ThreadReplyItem';
import { ThreadCompose } from './ThreadCompose';
import { ThreadPost } from './ThreadPost';
import { useHideAuto } from '../_lib/hide-auto';
import { ContentMenu, type ContentMenuItem } from './ContentMenu';
import { TokenOfferPayButton } from './TokenOfferPayButton';
import { RaiseBountyControl } from './RaiseBountyControl';
import { InlineEditor } from './InlineEditor';
import type { Post, ReportReason, ThreadReply } from '@/lib/types';

type SortMode = 'newest' | 'oldest' | 'top';

const VISIBLE_COUNT = 3;

interface ThreadPanelProps {
  post: Post | null;
  open: boolean;
  onClose: () => void;
  onAwardBounty?: (postId: string, replyId: string) => void;
  /** Absent while the agent is offline; the badge shows it only to the author of an open bounty. */
  onExtendBounty?: (postId: string) => void;
  extendingBounty?: boolean;
  /** Absent while the agent is offline; shown to the author under a reply that carries an ask (phase 3). */
  onRaiseBounty?: (postId: string, amount: number) => void;
  raisingBounty?: boolean;
}

export function ThreadPanel({ post, open, onClose, onAwardBounty, onExtendBounty, extendingBounty, onRaiseBounty, raisingBounty }: ThreadPanelProps) {
  const [sort, setSort] = useState<SortMode>('newest');
  const [showAll, setShowAll] = useState(false);
  /* Leave out replies an autopilot posted (`hide_auto=1` on the tracker) and, on the feed, auto posts. Shared and kept in this browser. */
  const [hideAuto, setHideAuto] = useHideAuto();

  const { connected: agentConnected } = useDaemon();
  const platform = useIsPlatformPeer();
  const { data: me, isFetched: meFetched, isError: meFailed } = usePeerMe();
  const wallet = useWalletService();
  /* The author's linked wallet as the network knows it: undefined until peers/me answered, null when none is linked. */
  const linkedWallet = meFetched ? (me?.walletAddress ?? null) : undefined;
  const connectedWallet = wallet.connected ? wallet.publicKey : null;

  const { data: replies = [], isLoading: repliesLoading, isError: repliesError, failureCount } = useThread(post?.id ?? '', hideAuto);
  const repliesFailed = repliesError || (repliesLoading && failureCount > 0);
  const isLoading = repliesLoading && !repliesFailed;

  const acceptReply = useAcceptReply();
  const report = useReportContent();
  const watch = useWatchPost();
  const pin = usePinPost();
  const hide = useHideContent();
  /* Round 2: edits and deletes by the author; which item is being edited in place ('post' or a reply id). */
  const editPost = useEditPost();
  const deletePost = useDeletePost();
  const editReply = useEditReply();
  const deleteReply = useDeleteReply();
  const [editing, setEditing] = useState<string | null>(null);
  const payment = usePayTokenOffer(wallet, linkedWallet, post?.id ?? null);

  // Reset local state when panel opens or post changes
  useEffect(() => {
    if (open) {
      setSort('newest');
      setShowAll(false);
      setEditing(null);
      payment.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; the payment object is not
  }, [open, post?.id]);

  /* Escape closes the panel (an open in-place editor takes the key first and only closes itself). */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editing === null) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, editing, onClose]);

  /* The edited reply or post shows the tracker's answer at once; the refetch confirms it. */
  useEffect(() => {
    if (editPost.isSuccess || editReply.isSuccess) setEditing(null);
  }, [editPost.isSuccess, editReply.isSuccess]);

  /* The accepted reply sits under the post whatever the sort; the rest are sorted as asked. */
  const accepted = useMemo(() => replies.find(r => r.accepted) ?? null, [replies]);
  /* The replies list is the live truth (it is patched on accept); the post prop may be an older snapshot. */
  const hasAccepted = accepted !== null;
  const sorted = useMemo(() => {
    const copy = replies.filter(r => !r.accepted);
    if (sort === 'oldest') return copy;
    if (sort === 'top') return copy.sort((a, b) => b.upvotes - a.upvotes);
    return copy.reverse();
  }, [sort, replies]);

  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_COUNT);
  const hiddenCount = sorted.length - VISIBLE_COUNT;

  const reportPost = useCallback(
    (reason: ReportReason, note: string) => post && report.mutate({ target: 'post', id: post.id, reason, note }),
    [post, report],
  );

  const renderReply = (reply: ThreadReply) => {
    if (!post) return null;
    const isOP = reply.author === post.author;
    const mine = agentConnected && me?.peerId === reply.author;
    const platformItems: ContentMenuItem[] = platform
      ? [
          {
            id: 'hide',
            label: reply.hidden ? 'Unhide' : 'Hide',
            icon: 'eye',
            danger: !reply.hidden,
            onSelect: () => hide.mutate({ target: 'reply', id: reply.id, postId: post.id, hide: !reply.hidden }),
          },
        ]
      : [];
    /* Round 2: the author edits or deletes their reply; a platform peer may delete any. */
    const ownItems: ContentMenuItem[] = [];
    if (!reply.deleted) {
      if (mine) ownItems.push({ id: 'edit', label: 'Edit', icon: 'edit-3', onSelect: () => setEditing(reply.id) });
      if (mine || platform) ownItems.push({ id: 'delete', label: 'Delete', icon: 'x', danger: true, onSelect: () => deleteReply.mutate({ postId: post.id, replyId: reply.id }) });
    }
    const menu = agentConnected ? (
      <ContentMenu
        testId={`reply-${reply.id}`}
        items={[...ownItems, ...platformItems]}
        onReport={mine || reply.deleted ? undefined : (reason, note) => report.mutate({ target: 'reply', id: reply.id, reason, note })}
        reporting={report.isPending}
      />
    ) : undefined;
    const editor =
      editing === reply.id ? (
        <InlineEditor
          testId={`reply-${reply.id}`}
          initial={reply.body}
          saving={editReply.isPending}
          onSave={body => editReply.mutate({ postId: post.id, replyId: reply.id, body })}
          onCancel={() => setEditing(null)}
        />
      ) : undefined;
    const authorActions = post.isAuthor && agentConnected && !isOP;
    const actions = authorActions ? (
      <>
        {post.bounty?.status === 'open' && onAwardBounty && (
          <button
            data-testid={`award-bounty-${reply.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow cursor-pointer hover:bg-accent-yellow/20 transition-colors"
            onClick={() => onAwardBounty(post.id, reply.id)}
          >
            <Icon name="star" size="sm" /> Award Bounty ({post.bounty.amount} {post.bounty.currency})
          </button>
        )}
        {!reply.accepted && (
          <button
            data-testid={`accept-reply-${reply.id}`}
            disabled={acceptReply.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-accent-green/30 bg-accent-green/10 text-accent-green cursor-pointer hover:bg-accent-green/20 transition-colors disabled:opacity-50"
            onClick={() => acceptReply.mutate({ postId: post.id, replyId: reply.id })}
            title={hasAccepted ? 'Moves the accepted answer to this reply' : 'Marks this reply as the answer'}
          >
            <Icon name="check" size="sm" /> {hasAccepted ? 'Accept instead' : 'Accept answer'}
          </button>
        )}
        {post.tokenOffer && post.tokenOffer.mint && (
          <TokenOfferPayButton
            post={{ ...post, tokenOffer: post.tokenOffer }}
            reply={reply}
            payer={{ linked: linkedWallet, connected: connectedWallet, unavailable: meFailed }}
            status={payment.status}
            activeReplyId={payment.replyId}
            pending={payment.pending[reply.id] ?? null}
            onPay={(p, r) => void payment.pay({ post: p, reply: r })}
            onRecord={(p, r, signature) => void payment.record({ post: p, reply: r, signature })}
          />
        )}
        {reply.ask !== undefined && onRaiseBounty && (!post.bounty || post.bounty.status === 'open') && (
          <RaiseBountyControl post={post} replyId={reply.id} ask={reply.ask} onRaise={onRaiseBounty} raising={raisingBounty === true} />
        )}
      </>
    ) : undefined;
    return <ThreadReplyItem key={reply.id} reply={reply} isOP={isOP} viewerIsAuthor={mine} menu={menu} actions={actions} editor={editor} />;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[300] bg-black/50 transition-opacity duration-250',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-[301] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'w-full md:w-[420px] bg-bg-secondary border-l border-border-default',
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-label="Thread"
        data-testid="thread-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h3 className="text-lg font-bold text-accent-green flex items-center gap-2">
            <Icon name="message-circle" size="sm" /> Thread
            <span className="text-xs text-text-secondary font-normal ml-2">{post?.commentCount ?? 0} replies</span>
          </h3>
          <button
            data-testid="thread-close"
            onClick={onClose}
            className="flex items-center justify-center w-[44px] h-[44px] bg-transparent border-none text-text-secondary cursor-pointer rounded hover:bg-accent-green/8 hover:text-text-primary transition-colors"
            aria-label="Close thread"
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {post && (
            <>
              <ThreadPost
                post={post}
                agentConnected={agentConnected}
                platform={platform}
                onExtendBounty={onExtendBounty}
                extendingBounty={extendingBounty}
                onWatch={(postId, watching) => watch.mutate({ postId, watch: watching })}
                watchPending={watch.isPending}
                onReport={reportPost}
                reporting={report.isPending}
                onPin={(postId, pinned) => pin.mutate({ postId, pin: pinned })}
                onHide={(postId, hidden) => hide.mutate({ target: 'post', id: postId, postId, hide: hidden })}
                onEdit={agentConnected ? () => setEditing('post') : undefined}
                onDelete={agentConnected ? () => deletePost.mutate(post.id) : undefined}
                canDeleteAsPlatform={platform}
                editor={
                  editing === 'post' ? (
                    <InlineEditor
                      testId="thread-post"
                      initial={post.body}
                      saving={editPost.isPending}
                      onSave={body => editPost.mutate({ postId: post.id, body })}
                      onCancel={() => setEditing(null)}
                    />
                  ) : undefined
                }
              />

              {/* The accepted answer, pinned under the post */}
              {!isLoading && accepted && (
                <div className="mb-3" data-testid="thread-accepted">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-accent-green mb-1 inline-flex items-center gap-1">
                    <Icon name="check-circle" size="sm" /> Accepted answer
                  </p>
                  {renderReply(accepted)}
                </div>
              )}

              {/* Sort buttons + the auto-reply filter */}
              <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="thread-sort">
                {(['newest', 'oldest', 'top'] as const).map(mode => (
                  <button
                    key={mode}
                    data-testid={`thread-sort-${mode}`}
                    onClick={() => setSort(mode)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-colors min-h-[32px] bg-transparent font-mono',
                      sort === mode
                        ? 'border-accent-green text-accent-green bg-accent-green/8'
                        : 'border-border-default text-text-secondary hover:border-border-hover',
                    )}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideAuto}
                    onChange={e => setHideAuto(e.target.checked)}
                    className="accent-accent-green"
                    data-testid="thread-hide-auto"
                  />
                  Hide auto posts and replies
                </label>
              </div>

              {/* Loading skeleton */}
              {isLoading && (
                <div className="flex flex-col gap-3" data-testid="thread-loading">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-3 py-3">
                      <div className="w-7 h-7 rounded-full bg-bg-tertiary animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 bg-bg-tertiary rounded animate-pulse" />
                        <div className="h-3 w-full bg-bg-tertiary rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {repliesFailed && replies.length === 0 && (
                <p className="py-3 text-sm text-text-tertiary" data-testid="thread-failed">
                  Couldn&apos;t load replies.
                </p>
              )}

              {/* Replies */}
              {!isLoading && <div className="flex flex-col">{visible.map(renderReply)}</div>}

              {!isLoading && !showAll && hiddenCount > 0 && (
                <button
                  data-testid="thread-show-more"
                  onClick={() => setShowAll(true)}
                  className="w-full mt-3 py-2 text-xs font-semibold text-accent-green bg-transparent border border-accent-green/30 rounded-lg cursor-pointer hover:bg-accent-green/8 transition-colors min-h-[44px] font-mono"
                >
                  Show {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Compose footer; a deleted post takes no more replies */}
        {post && !post.deleted && <ThreadCompose postId={post.id} viewCount={post.viewCount} />}
      </div>
    </>
  );
}
