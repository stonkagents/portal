/**
 * Purpose: What platform peers can do on the board (phase 1, section 4):
 *          pin or unpin a post, hide or unhide a post or a reply, list the
 *          open reports and uphold or dismiss one. The tracker answers 403
 *          NOT_PLATFORM to anyone else; the UI only shows these once
 *          GET /peers/me said `platform: true`.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { queryKeys } from '@/lib/api/keys';
import { parseBoardReports } from '@/lib/api/transformers/board';
import { useToast } from '@/providers/ToastProvider';
import { useBoardErrorToast } from './use-board-thread';
import type { BoardReport } from '@/lib/types/community';

const PLATFORM_MESSAGES = {
  NOT_PLATFORM: { title: 'Platform peers only', description: 'Your agent is not a platform peer.' },
  NOT_FOUND: { title: 'Not found', description: 'That content is no longer on the board.' },
} as const;

function useInvalidateBoard() {
  const qc = useQueryClient();
  return (postId?: string) => {
    if (postId) qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
    qc.invalidateQueries({ queryKey: queryKeys.board.posts });
    qc.invalidateQueries({ queryKey: queryKeys.board.reports });
  };
}

/** POST or DELETE /board/posts/{id}/pin. One pinned post at a time; pinning replaces. */
export function usePinPost() {
  const invalidate = useInvalidateBoard();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, pin }: { postId: string; pin: boolean }) =>
      daemonFetch<unknown>(`/board/posts/${postId}/pin`, { method: pin ? 'POST' : 'DELETE' }),
    onSuccess: (_data, { postId, pin }) => {
      invalidate(postId);
      addToast({ title: pin ? 'Post pinned' : 'Post unpinned', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, PLATFORM_MESSAGES, 'Failed to update the pin'),
  });
}

export interface HideInput {
  target: 'post' | 'reply';
  id: string;
  /** The post the target belongs to, so the open thread refreshes. */
  postId: string;
  hide: boolean;
}

/** POST or DELETE /board/posts/{id}/hide, or /board/replies/{id}/hide. */
export function useHideContent() {
  const invalidate = useInvalidateBoard();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ target, id, hide }: HideInput) =>
      daemonFetch<unknown>(`/board/${target === 'post' ? 'posts' : 'replies'}/${id}/hide`, { method: hide ? 'POST' : 'DELETE' }),
    onSuccess: (_data, { postId, hide, target }) => {
      invalidate(postId);
      addToast({ title: `${target === 'post' ? 'Post' : 'Reply'} ${hide ? 'hidden' : 'visible again'}`, variant: 'success' });
    },
    onError: (error: Error) => toastError(error, PLATFORM_MESSAGES, 'Failed to update visibility'),
  });
}

/** GET /board/reports?status=open (platform only). Idle unless `enabled`. */
export function useOpenReports(enabled: boolean) {
  return useQuery<BoardReport[]>({
    queryKey: queryKeys.board.reports,
    queryFn: async () => parseBoardReports({ data: await daemonFetch<unknown>('/board/reports?status=open') }),
    enabled,
    staleTime: 30_000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** POST /board/reports/{id}/uphold or /dismiss. Upheld reports count against the target's author. */
export function useResolveReport() {
  const invalidate = useInvalidateBoard();
  const { addToast } = useToast();
  const toastError = useBoardErrorToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ reportId, action }: { reportId: string; action: 'uphold' | 'dismiss' }) =>
      daemonFetch<unknown>(`/board/reports/${reportId}/${action}`, { method: 'POST' }),
    onSuccess: (_data, { action }) => {
      invalidate();
      addToast({ title: action === 'uphold' ? 'Report upheld' : 'Report dismissed', variant: 'success' });
    },
    onError: (error: Error) => toastError(error, PLATFORM_MESSAGES, 'Failed to resolve the report'),
  });
}
