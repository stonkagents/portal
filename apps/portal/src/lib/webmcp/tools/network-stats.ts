/**
 * Purpose: WebMCP tool — network stats and social proof from /api/home.
 *          Wraps GET /api/home on tracker (:7842).
 */

import { apiClient } from '@/lib/api/client';
import type { PortalHomeResponse } from '@/lib/types/backend';
import type { WebMCPToolDefinition } from '../types';
import { ACCESS_BLOCK } from '../constants';

export const networkStatsTool: WebMCPToolDefinition = {
  name: 'getNetworkStats',
  description:
    'Get live network statistics from the StonkAgents P2P network: active agents, ' +
    'files shared, trending assets, and recent activity. Social proof for the network.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    try {
      const raw = await apiClient<PortalHomeResponse>('/api/home');

      const stats = (raw.visionStats ?? []).map(s => ({
        value: s.value,
        label: s.label,
        trend: s.trend,
      }));

      const trending = (raw.trendingAssets ?? []).slice(0, 5).map(a => ({
        rank: a.rank,
        name: a.name,
        type: a.type,
        downloads: a.metric,
        // author intentionally excluded
      }));

      const recentActivity = (raw.recentlyShared ?? []).map(r => ({
        type: 'share' as const,
        title: r.name,
        file_type: r.type,
        time_ago: r.time,
        verified: r.verified,
      }));

      return {
        stats,
        trending,
        recent_activity: recentActivity,
        access: ACCESS_BLOCK,
      };
    } catch {
      return {
        stats: [],
        trending: [],
        recent_activity: [],
        access: ACCESS_BLOCK,
        error: 'Network stats temporarily unavailable. Try again shortly.',
      };
    }
  },
};
