/**
 * Purpose: Transform tracker /api/tokens response to frontend Token type
 */

import { raydiumTokenUrl } from '@/lib/launchlab/venues';
import type { Token } from '@/lib/types/token';
import type { PortalTokenListItem } from '@/lib/types/backend';

/** Map PortalTokenListItem → Token: derive status, venue link, $ prefix, null-safe metrics */
export function transformTokenListItem(raw: PortalTokenListItem): Token {
  const m = raw.metrics;

  return {
    id: raw.token_contract_address,
    name: raw.token_name,
    symbol: raw.token_ticker.startsWith('$') ? raw.token_ticker : `$${raw.token_ticker}`,
    image: raw.token_image_url ?? null,
    creator: raw.peer_id,
    status: m?.complete === true ? 'migrated' : 'bonding',
    bondingCurveProgress: m?.bondingCurvePercent ?? 0,
    solRaised: m?.solRaised ?? 0,
    holders: m?.holders ?? 0,
    createdAt: raw.launched_at,
    tokenUrl: raydiumTokenUrl(raw.token_contract_address),
  };
}
