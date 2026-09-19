/**
 * Agent detail page: one agent's token by mint.
 * Sections: header, stats, curve progress, chart, live tx, buy/sell, holder chat.
 * Server wrapper exports generateStaticParams for static export.
 */

import type { Metadata } from 'next';
import { TokenDetailClient } from '../_components/TokenDetailClient';
import { AGENT_MINT } from '@/lib/agent-token';

/** The pre-rendered shell serves every mint, so its title must not name one. */
export const metadata: Metadata = {
  title: 'Agent',
  description: 'A token launched on the Network, trading on a Raydium LaunchLab curve.',
};

const TOKEN_LIST_LIMIT = 200;
const LAUNCH_PAGE_LIMIT = 100;

function trackerOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_TRACKER_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api(\/v1)?$/, '');
}

async function readMints(url: string, pick: (row: Record<string, unknown>) => unknown): Promise<string[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const body = await res.json();
    const data = (body?.data ?? body) as unknown;
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return rows.map(pick).filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

/**
 * Required for static export (output: 'export'): every mint the tracker knows,
 * from the launch list and the legacy token list, plus the $AGENT mint, so each
 * detail path is pre-rendered. The placeholder shell is ALWAYS emitted: CloudFront rewrites
 * /tokens/<mint>/ (and its RSC payload) to it for any mint launched after the
 * build, and the client resolves the mint from the URL.
 */
export async function generateStaticParams() {
  const base = trackerOrigin();
  if (!base) {
    return [{ tokenId: 'placeholder' }, { tokenId: AGENT_MINT }];
  }

  const [launches, listings] = await Promise.all([
    readMints(`${base}/api/launches?limit=${LAUNCH_PAGE_LIMIT}`, row => row.mint),
    readMints(`${base}/api/tokens?limit=${TOKEN_LIST_LIMIT}`, row => row.token_contract_address),
  ]);

  const params = [...new Set([AGENT_MINT, ...launches, ...listings])].map(tokenId => ({ tokenId }));
  return [{ tokenId: 'placeholder' }, ...params.filter(p => p.tokenId !== 'placeholder')];
}

export default function TokenDetailPage() {
  return <TokenDetailClient />;
}
