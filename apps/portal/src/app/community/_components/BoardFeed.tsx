/**
 * Purpose: The board's post list for one query, shared by the Community page
 *          and the Discussion tab of a token page (phase 2): the infinite list
 *          (through the agent when connected, straight from the tracker for
 *          anyone else), its loading, failed and empty states, the cards with
 *          their upvote and extend actions, and the thread panel. Reading is
 *          public; acting (upvote, extend, award, raise) and the Mine view
 *          need the agent. The open thread is the caller's state (`?post=` on
 *          the Community page, local on a token page); `above` gets
 *          `openThreadById` so the panels rendered over the list can open a
 *          thread by id.
 */
'use client';

import { Fragment, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { Button, EmptyState } from '@/components/ui';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import {
  useCommunityInfinite,
  useUpvotePost,
  useAwardBounty,
  useExtendBounty,
  useRaiseBounty,
  usePost,
} from '@/lib/api/hooks/use-community';
import { useDaemon } from '@/providers/DaemonProvider';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { PostCard } from './PostCard';
import { ThreadPanel } from './ThreadPanel';
import { emptyBoardMessage } from '../_lib/board-query';
import { useHideAuto } from '../_lib/hide-auto';
import { NewSinceDivider, newSinceIndex } from './NewSinceDivider';
import { transformPost } from '@/lib/api/transformers/community';
import type { BoardQuery, Post } from '@/lib/types';

const PAGE_SIZE = 20;

interface BoardFeedProps {
  query: BoardQuery;
  /** The open thread's post id; empty for none. */
  openPostId: string;
  onOpenPostChange: (postId: string | null) => void;
  /** Rendered between the header and the list; receives a way to open a thread by id. */
  above?: (openThreadById: (postId: string) => void) => ReactNode;
}

/**
 * Why the board could not load, for the failed state: the mapped reason (rate limited,
 * the network not answering, the agent unreachable) or, while a retry is still in
 * flight, that it is retrying. Exported for tests.
 */
export function boardFailureDescription(error: unknown, retrying: boolean): string {
  if (retrying) return 'Retrying.';
  const mapped = error ? mapErrorToUserMessage(error) : null;
  return mapped ? `${mapped.description} Retry when you are ready.` : 'Retry when you are ready.';
}

/** Room-pinned posts (the launch announcement) come first in a room; the tracker's order stands otherwise. */
export function orderFeed(posts: Post[], room: string): Post[] {
  if (!room) return posts;
  return [...posts.filter(p => p.roomPinned), ...posts.filter(p => !p.roomPinned)];
}

export function BoardFeed({ query, openPostId, onOpenPostChange, above }: BoardFeedProps) {
  const [threadPost, setThreadPost] = useState<Post | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);

  const {
    data: infiniteData,
    isLoading,
    isError,
    error,
    failureCount,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommunityInfinite(query, PAGE_SIZE);
  const { connected: agentConnected } = useDaemon();
  /* Mine is the owner's own activity; without the agent there is nothing to show but where to get one. */
  const mineNeedsAgent = query.tab === 'mine' && !query.agent && !agentConnected;
  /* Once a fetch has failed, the skeleton gives way to a plain message rather than pulsing until something answers. */
  const boardUnavailable = !mineNeedsAgent && (isError || (isLoading && failureCount > 0));
  const showSkeleton = isLoading && !boardUnavailable && !mineNeedsAgent;

  /* Flatten all pages into a single post list; sorting and filtering are the tracker's, except the
     reader's own "Hide auto posts and replies" switch, which drops posts an autopilot wrote. */
  const [hideAuto] = useHideAuto();
  const boardPosts = useMemo(() => {
    const posts = infiniteData?.pages.flatMap(page => page.posts) ?? [];
    return orderFeed(hideAuto ? posts.filter(p => !p.auto) : posts, query.room);
  }, [infiniteData, query.room, hideAuto]);
  /* Round 2: the tracker's answer to the first page carries the viewer's previous visit; the
     divider sits before the first post older than it (never at the top, never at the end). */
  const lastVisitAt = infiniteData?.pages[0]?.lastVisitAt ?? null;
  const dividerAt = useMemo(() => newSinceIndex(boardPosts, lastVisitAt), [boardPosts, lastVisitAt]);

  const upvoteMutation = useUpvotePost();
  const awardBounty = useAwardBounty();
  const extendBounty = useExtendBounty();
  const raiseBounty = useRaiseBounty();

  // --- Deep link: the open post id opens the thread ---
  const { data: deepLinkedPost } = usePost(openPostId);
  const deepLinkHandledRef = useRef(false);

  /* The thread follows the latest answer for the open post, not the first one: usePost
     answers straight from the tracker until the agent is known to be connected, then
     again through the agent with isAuthor / upvotedByMe, in either order. */
  useEffect(() => {
    if (!deepLinkedPost || deepLinkedPost.id !== openPostId) return;
    setThreadPost(deepLinkedPost);
    if (!deepLinkHandledRef.current) {
      deepLinkHandledRef.current = true;
      setThreadOpen(true);
    }
  }, [deepLinkedPost, openPostId]);

  // Reset deep link ref when the open post is cleared
  useEffect(() => {
    if (!openPostId) {
      deepLinkHandledRef.current = false;
    }
  }, [openPostId]);

  const openThread = useCallback(
    (post: Post) => {
      setThreadPost(post);
      setThreadOpen(true);
      onOpenPostChange(post.id);
    },
    [onOpenPostChange],
  );

  const closeThread = useCallback(() => {
    setThreadOpen(false);
    onOpenPostChange(null);
  }, [onOpenPostChange]);

  /* A suggestion names its post by id; open it from the loaded pages, or fall back to the deep link. */
  const openThreadById = useCallback(
    (postId: string) => {
      const post = boardPosts.find(p => p.id === postId);
      if (post) {
        openThread(post);
      } else {
        deepLinkHandledRef.current = false;
        onOpenPostChange(postId);
      }
    },
    [boardPosts, openThread, onOpenPostChange],
  );

  /* Extending answers with the updated post; the open thread follows it without a refetch. */
  const onExtendBounty = useCallback(
    (postId: string) =>
      extendBounty.mutate(postId, {
        onSuccess: updated => setThreadPost(prev => (prev?.id === updated.id ? updated : prev)),
      }),
    [extendBounty],
  );

  /* Raising answers with the updated post when the tracker sends one; the open thread follows it. */
  const onRaiseBounty = useCallback(
    (postId: string, amount: number) =>
      raiseBounty.mutate(
        { postId, amount },
        { onSuccess: updated => updated && setThreadPost(prev => (prev?.id === updated.id ? updated : prev)) },
      ),
    [raiseBounty],
  );

  // --- Infinite scroll sentinel ---
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      {above?.(openThreadById)}

      {showSkeleton && (
        <div className="space-y-3" data-testid="board-loading">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-bg-secondary border border-border-default rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {mineNeedsAgent && <AgentRequiredNotice variant="panel" data-testid="board-mine-needs-agent" />}

      {boardUnavailable && boardPosts.length === 0 && (
        <EmptyState
          title="Couldn't load the board."
          description={boardFailureDescription(error, !isError)}
          /* The automatic retry is spent by now: nothing tries again until the reader asks. */
          action={
            isError ? (
              <Button variant="ghost" size="sm" loading={isFetching} onClick={() => void refetch()} data-testid="board-retry">
                Retry
              </Button>
            ) : undefined
          }
          data-testid="board-unavailable"
        />
      )}

      {!showSkeleton &&
        !mineNeedsAgent &&
        boardPosts.map((post, i) => (
          <Fragment key={post.id}>
          {i === dividerAt && <NewSinceDivider />}
          <PostCard
            post={post}
            onClick={() => openThread(post)}
            /* Upvotes and extensions go through the agent; without it the controls are disabled or gone. */
            onUpvote={agentConnected ? id => upvoteMutation.mutate(id) : undefined}
            onExtendBounty={agentConnected ? onExtendBounty : undefined}
            extendingBounty={extendBounty.isPending && extendBounty.variables === post.id}
            /* Inside a room every post is the room's; on the main feed (Mine views) a room post says where it lives. */
            showRoomChip={!query.room}
          />
          </Fragment>
        ))}

      {!isLoading && !boardUnavailable && !mineNeedsAgent && boardPosts.length === 0 && (
        <div className="text-center py-8 text-text-tertiary text-sm" data-testid="board-empty">
          {emptyBoardMessage(query)}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <div className="w-4 h-4 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
            Loading more posts...
          </div>
        </div>
      )}

      <ThreadPanel
        post={threadPost}
        open={threadOpen}
        onClose={closeThread}
        onAwardBounty={
          agentConnected
            ? (postId, replyId) =>
                awardBounty.mutate(
                  { postId, replyId },
                  {
                    onSuccess: updatedPost => setThreadPost(transformPost(updatedPost)),
                  },
                )
            : undefined
        }
        onExtendBounty={agentConnected ? onExtendBounty : undefined}
        extendingBounty={extendBounty.isPending && extendBounty.variables === threadPost?.id}
        onRaiseBounty={agentConnected ? onRaiseBounty : undefined}
        raisingBounty={raiseBounty.isPending && raiseBounty.variables?.postId === threadPost?.id}
      />
    </>
  );
}
