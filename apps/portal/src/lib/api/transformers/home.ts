/**
 * Purpose: Transform tracker portal /api/home response to frontend HomeResponse
 */

import type { HomeResponse, RecentlySharedItem } from '@/lib/types/home';
import type { PortalHomeResponse, PortalRecentlyShared } from '@/lib/types/backend';

/** Map portal recentlyShared (author field) → frontend (agent field) */
function transformRecentlyShared(raw: PortalRecentlyShared): RecentlySharedItem {
  return {
    type: raw.type,
    name: raw.name,
    agent: raw.author,
    time: raw.time,
  };
}

/** Transform full home response — visionStats/trendingAssets pass through, recentlyShared needs mapping */
export function transformHomeResponse(raw: PortalHomeResponse): HomeResponse {
  return {
    visionStats: raw.visionStats,
    trendingAssets: raw.trendingAssets,
    mostInstalled: raw.mostInstalled,
    recentlyShared: (raw.recentlyShared ?? []).map(transformRecentlyShared),
  };
}
