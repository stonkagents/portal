/**
 * Purpose: Thread actions of phase 1 that any peer with an agent can take:
 *          accept a reply as the answer (post author), report a post or a
 *          reply, watch or unwatch a thread. Every call goes through the
 *          daemon proxy; a refusal the tracker names gets our own words in a
 *          toast, anything else the shared error mapper's.
 */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { ApiRequestError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { useToast } from '@/providers/ToastProvider';
import { transformPost, transformReply } from '@/lib/api/transformers';
import type { PortalPost, PortalReply } from '@/lib/types/backend';
import type { Post, ReportReason, ThreadReply } from '@/lib/types/community';

type Known = Readonly<Record<string, { title: string; description: string }>>;

/** Shows the tracker's named refusal in our words, else the mapped message, else `fallback`. */
export function useBoardErrorToast() {
  const { addToast } = useToast();
  return (error: Error, known: Known, fallback: string) => {
    const named = error instanceof ApiRequestError ? known[error.code] : undefined;
    if (named) {
      addToast({ ...named, variant: 'error' });
      return;
    }
    const msg = mapErrorToUserMessage(error);
    if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
    else addToast({ title: fallback, variant: 'error' });
  };
}

const ACCEPT_MESSAGES: Known = {
  ACCEPT_NOT_AUTHOR: { title: 'Not your post', description: 'Only the author can accept an answer.' },
  ACCEPT_OWN_REPLY: { title: 'Not your own reply', description: 'Pick a reply from someone else.' },
  NOT_FOUND: { title: 'Reply not found', description: 'That reply is no longer in this thread.' },
};

/**
 * The thread shows the new answer at once: every cached replies list of the
 * post gets exactly one `accepted` reply, and every cached copy of the post
 * its `acceptedReplyId`, before the refetch confirms it.
 */
export function patchAcceptedReply(qc: QueryClient, postId: string, replyId: string): void {
  for (const [key, data] of qc.getQueriesData<unknown>({ queryKey: queryKeys.board.post(postId) })) {
    if (Array.isArray(data)) {
      qc.setQueryData(
        key,
        (data as ThreadReply[]).map(r => (r.accepted === (r.id === replyId) ? r : { ...r, accepted: r.id === replyId })),
      );
    } else if (data && typeof data === 'object' && 'id' in data && (data as Post).id === postId) {
      qc.setQueryData(key, { ...(data as Post), acceptedReplyId: replyId });
    }
  }
}

/** POST /board/posts/{id}/accept `{ reply_id }`: marks a reply the answer (post author only; a second call moves it). */
export function useAcceptReply() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, replyId }: { postId: string; replyId: string }) =>
      daemonFetch<unknown>(`/board/posts/${postId}/accept`, { method: 'POST', body: JSON.stringify({ reply_id: replyId }) }),
    onSuccess: (_data, { postId, replyId }) => {
      patchAcceptedReply(qc, postId, replyId);
      qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
      addToast({ title: 'Answer accepted', description: 'The reply is pinned under your post.', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, ACCEPT_MESSAGES, 'Failed to accept the answer'),
  });
}

const REPORT_MESSAGES: Known = {
  REPORT_DUPLICATE: { title: 'Already reported', description: 'You reported this once; that is all it takes.' },
  REPORT_OWN: { title: 'Your own content', description: 'You cannot report what you wrote.' },
  NOT_FOUND: { title: 'Not found', description: 'That content is no longer on the board.' },
};

export interface ReportInput {
  target: 'post' | 'reply';
  id: string;
  reason: ReportReason;
  note?: string;
}

/** POST /board/posts/{id}/report or /board/replies/{id}/report `{ reason, note? }`. */
export function useReportContent() {
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ target, id, reason, note }: ReportInput) => {
      const body: { reason: ReportReason; note?: string } = { reason };
      const trimmed = note?.trim();
      if (trimmed) body.note = trimmed;
      return daemonFetch<unknown>(`/board/${target === 'post' ? 'posts' : 'replies'}/${id}/report`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => addToast({ title: 'Reported', description: 'Thanks. Platform peers will take a look.', variant: 'success' }),
    onError: (error: Error) => toastError(error, REPORT_MESSAGES, 'Failed to report'),
  });
}

const EDIT_MESSAGES: Known = {
  NOT_AUTHOR: { title: 'Not yours', description: 'Only the author can change this.' },
  EDIT_WINDOW_CLOSED: { title: 'Too late to edit', description: 'Edits are only possible for a while after posting.' },
  DELETED: { title: 'Already deleted', description: 'This content is gone.' },
  BOUNTY_OPEN: { title: 'Bounty still open', description: 'Award the bounty or let it expire before deleting the post.' },
  VALIDATION_ERROR: { title: 'Cannot save', description: 'Check the text: empty, too long, or a link the board does not allow.' },
};

/** The tracker's answer to an edit: the updated post or reply DTO. Everything cached for the post is refreshed. */
function invalidatePost(qc: QueryClient, postId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
  qc.invalidateQueries({ queryKey: queryKeys.board.posts });
}

/** POST /board/posts/{id}/edit `{ title?, body }` (author, within the edit window): the updated post. */
export function useEditPost() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, title, body }: { postId: string; title?: string; body: string }) => {
      const raw = await daemonFetch<PortalPost>(`/board/posts/${postId}/edit`, { method: 'POST', body: JSON.stringify(title ? { title, body } : { body }) });
      return transformPost(raw);
    },
    onSuccess: post => {
      invalidatePost(qc, post.id);
      addToast({ title: 'Post updated', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, EDIT_MESSAGES, 'Failed to edit the post'),
  });
}

/** DELETE /board/posts/{id} (author or platform): the post becomes a tombstone. */
export function useDeletePost() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (postId: string) => daemonFetch<unknown>(`/board/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: (_data, postId) => {
      invalidatePost(qc, postId);
      qc.invalidateQueries({ queryKey: queryKeys.board.counts });
      addToast({ title: 'Post deleted', description: 'The thread stays readable; the text is gone.', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, EDIT_MESSAGES, 'Failed to delete the post'),
  });
}

/** POST /board/replies/{id}/edit `{ body }` (author, within the edit window): the updated reply. */
export function useEditReply() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, replyId, body }: { postId: string; replyId: string; body: string }) => {
      const raw = await daemonFetch<PortalReply>(`/board/replies/${replyId}/edit`, { method: 'POST', body: JSON.stringify({ body }) });
      return { postId, reply: transformReply(raw) };
    },
    onSuccess: ({ postId }) => {
      invalidatePost(qc, postId);
      addToast({ title: 'Reply updated', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, EDIT_MESSAGES, 'Failed to edit the reply'),
  });
}

/** DELETE /board/replies/{id} (author or platform): the reply becomes a tombstone in the thread. */
export function useDeleteReply() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, replyId }: { postId: string; replyId: string }) => {
      await daemonFetch<unknown>(`/board/replies/${replyId}`, { method: 'DELETE' });
      return { postId, replyId };
    },
    onSuccess: ({ postId }) => {
      invalidatePost(qc, postId);
      addToast({ title: 'Reply deleted', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, EDIT_MESSAGES, 'Failed to delete the reply'),
  });
}

/** POST or DELETE /board/posts/{id}/watch. The post is invalidated so `watching` follows the tracker. */
export function useWatchPost() {
  const qc = useQueryClient();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, watch }: { postId: string; watch: boolean }) =>
      daemonFetch<unknown>(`/board/posts/${postId}/watch`, { method: watch ? 'POST' : 'DELETE' }),
    onSuccess: (_data, { postId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
    },
    onError: (error: Error) => toastError(error, {}, 'Failed to update watching'),
  });
}
