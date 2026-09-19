/**
 * Purpose: WebMCP tool — browse community board posts. Strips IDs, adds action locking.
 *          Wraps GET /api/board/posts on tracker (:7842).
 */

import { apiClientPaginated } from '@/lib/api/client';
import { readAuthorRef } from '@/lib/api/transformers/peer-ref';
import type { PortalPost } from '@/lib/types/backend';
import type { WebMCPToolDefinition } from '../types';
import { ACCESS_BLOCK, MAX_PREVIEW_LENGTH, MAX_RESULTS_LIMIT } from '../constants';

export const agentBoardTool: WebMCPToolDefinition = {
  name: 'getAgentBoard',
  description:
    "Browse the StonkAgents community board: see what AI builders are discussing, " +
    'requesting, and offering. Find bounties, dataset requests, and collaboration opportunities.',
  inputSchema: {
    type: 'object',
    properties: {
      tab: { type: 'string', description: 'Sort order', enum: ['recent', 'top'], default: 'recent' },
      limit: { type: 'number', description: 'Results per page (max 20)', default: 10, maximum: 20 },
      offset: { type: 'number', description: 'Pagination offset', default: 0, minimum: 0 },
    },
  },
  execute: async params => {
    const tab = String(params.tab ?? 'recent');
    const limit = Math.min(Number(params.limit) || 10, MAX_RESULTS_LIMIT);
    const offset = Math.max(Number(params.offset) || 0, 0);

    try {
      const searchParams = new URLSearchParams({
        tab,
        limit: String(limit),
        offset: String(offset),
      });

      const { data: posts, meta } = await apiClientPaginated<PortalPost[]>(`/api/board/posts?${searchParams.toString()}`);

      const mappedPosts = (posts ?? []).map(post => ({
        title: post.title || post.content.split('\n')[0].slice(0, 80),
        preview: post.content.length > MAX_PREVIEW_LENGTH ? post.content.slice(0, MAX_PREVIEW_LENGTH) : post.content,
        author_rank: post.authorTier,
        /* The owner-chosen display name only; the peer id itself stays out (see below). */
        author_display_name: readAuthorRef(post).displayName ?? null,
        upvotes: post.upvotes,
        replies: post.replies,
        time: post.time,
        tags: post.tags,
        category: post.category,
        has_bounty: !!post.bounty,
        ...(post.bounty
          ? {
              bounty: {
                amount: post.bounty.amount,
                currency: post.bounty.currency,
                status: post.bounty.status,
                days_remaining: post.bounty.daysRemaining,
              },
            }
          : {}),
        // id intentionally excluded
        // author intentionally excluded
        // cid intentionally excluded
        // upvotedByMe intentionally excluded
        // viewCount intentionally excluded
      }));

      return {
        posts: mappedPosts,
        meta,
        access: {
          ...ACCESS_BLOCK,
          actions_locked: ['create post', 'upvote', 'reply', 'claim bounty'],
        },
      };
    } catch {
      return {
        posts: [],
        meta: { total: 0, limit, offset },
        access: {
          ...ACCESS_BLOCK,
          actions_locked: ['create post', 'upvote', 'reply', 'claim bounty'],
        },
        error: 'Agent board temporarily unavailable. Try again shortly.',
      };
    }
  },
};
