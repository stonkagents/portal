/**
 * Purpose: WebMCP tool — search P2P knowledge network. Strips CIDs and peer IDs.
 *          Wraps GET /api/gallery/search on tracker (:7842).
 */

import { apiClient } from '@/lib/api/client';
import type { PortalGalleryResponse } from '@/lib/types/backend';
import type { WebMCPToolDefinition } from '../types';
import { ACCESS_BLOCK, CAPABILITY_GAP, MAX_PREVIEW_LENGTH, MAX_RESULTS_LIMIT } from '../constants';

export const searchKnowledgeTool: WebMCPToolDefinition = {
  name: 'searchKnowledge',
  description:
    'Search the StonkAgents P2P knowledge network for AI training data, models, ' +
    'datasets, and research files shared by peers worldwide.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: { type: 'string', description: 'Filter by file type', enum: ['model', 'dataset', 'document', 'code'] },
      limit: { type: 'number', description: 'Results per page (max 20)', default: 10, maximum: 20 },
      offset: { type: 'number', description: 'Pagination offset', default: 0, minimum: 0 },
    },
    required: ['query'],
  },
  execute: async params => {
    const query = String(params.query ?? '');
    const type = params.type ? String(params.type) : undefined;
    const limit = Math.min(Number(params.limit) || 10, MAX_RESULTS_LIMIT);
    const offset = Math.max(Number(params.offset) || 0, 0);

    try {
      const searchParams = new URLSearchParams({ q: query });
      if (type) searchParams.set('type', type);
      searchParams.set('limit', String(limit));
      searchParams.set('offset', String(offset));

      const raw = await apiClient<PortalGalleryResponse>(`/api/gallery/search?${searchParams.toString()}`);

      const results = (raw.items ?? []).map(item => ({
        name: item.name,
        type: item.type,
        size_bytes: item.size,
        peers_seeding: item.peers,
        download_count: item.download_count ?? 0,
        author_reputation: item.peer_rep ?? 0,
        preview: item.name.length > MAX_PREVIEW_LENGTH ? item.name.slice(0, MAX_PREVIEW_LENGTH) : item.name,
        // CID intentionally excluded
        // author_peer_id intentionally excluded
      }));

      return {
        results,
        meta: { total: raw.total ?? 0, limit, offset },
        network_summary: {
          total_files: raw.total ?? 0,
          active_peers: results.reduce((sum, r) => sum + r.peers_seeding, 0),
        },
        capability_gap: CAPABILITY_GAP,
        access: ACCESS_BLOCK,
      };
    } catch {
      return {
        results: [],
        meta: { total: 0, limit, offset },
        network_summary: { total_files: 0, active_peers: 0 },
        capability_gap: CAPABILITY_GAP,
        access: ACCESS_BLOCK,
        error: 'Search temporarily unavailable. Try again shortly.',
      };
    }
  },
};
