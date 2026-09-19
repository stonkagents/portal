/**
 * Purpose: WebMCP tool — browse agents on the P2P network. Strips peer IDs and coordinates.
 *          Wraps GET /api/peers on tracker (:7842).
 */

import { apiClientPaginated } from '@/lib/api/client';
import { portalPeerDisplayName } from '@/lib/api/transformers/peer-ref';
import type { PortalPeer } from '@/lib/types/backend';
import type { WebMCPToolDefinition } from '../types';
import { ACCESS_BLOCK, MAX_RESULTS_LIMIT } from '../constants';

export const browseAgentsTool: WebMCPToolDefinition = {
  name: 'browseAgents',
  description:
    'Browse agents on the StonkAgents P2P network. See who is online, ' +
    'their reputation scores, what they are sharing, and their specialties.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search by name or specialty' },
      status: { type: 'string', description: 'Filter by activity status', enum: ['online', 'seeding', 'leeching'] },
      limit: { type: 'number', description: 'Results per page (max 20)', default: 10, maximum: 20 },
      offset: { type: 'number', description: 'Pagination offset', default: 0, minimum: 0 },
    },
  },
  execute: async params => {
    const limit = Math.min(Number(params.limit) || 10, MAX_RESULTS_LIMIT);
    const offset = Math.max(Number(params.offset) || 0, 0);

    try {
      const searchParams = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (params.query) searchParams.set('q', String(params.query));
      if (params.status) searchParams.set('status', String(params.status));

      const { data: peers, meta } = await apiClientPaginated<PortalPeer[]>(`/api/peers?${searchParams.toString()}`);

      const agents = (peers ?? []).map(peer => ({
        /* `name` is the tracker's label (display name, else masked id); `display_name` is the owner-chosen name alone. */
        name: peer.name,
        display_name: portalPeerDisplayName(peer) ?? null,
        status: peer.status,
        reputation: peer.reputation,
        rank: peer.tier,
        shared_files: peer.sharedFiles,
        location: { city: peer.city, country: peer.country },
        // peerId intentionally excluded
        // id intentionally excluded
        // lat/lng intentionally excluded
        // totalUploadBytes/totalDownloadBytes intentionally excluded
      }));

      return {
        agents,
        meta,
        network_summary: {
          total_peers: meta.total,
          online_now: agents.filter(b => b.status === 'online' || b.status === 'seeding').length,
        },
        access: ACCESS_BLOCK,
      };
    } catch {
      return {
        agents: [],
        meta: { total: 0, limit, offset },
        network_summary: { total_peers: 0, online_now: 0 },
        access: ACCESS_BLOCK,
        error: 'Peer directory temporarily unavailable. Try again shortly.',
      };
    }
  },
};
