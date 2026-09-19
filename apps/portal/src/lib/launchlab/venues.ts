/**
 * Outbound links for a LaunchLab pool.
 *
 * Hosts come from `config.links`, so moving a venue is a config change. Which
 * identifier each venue wants differs: Raydium's launchpad page takes the base
 * mint, Jupiter takes a mint pair, and the chart embeds take a pool address
 * when there is one and fall back to the mint.
 */

import { config } from '@/config';

const trim = (url: string): string => url.replace(/\/+$/, '');

/** The token's page on Raydium's launchpad, where the curve trades. */
export function raydiumTokenUrl(mint: string): string {
  return `${trim(config.links.raydiumLaunchpad)}/token/?mint=${encodeURIComponent(mint)}`;
}

/** Jupiter swap, quote in and token out. */
export function jupiterSwapUrl(quoteMint: string, mint: string): string {
  return `${trim(config.links.jupiter)}/swap/${quoteMint}-${mint}`;
}

/** Dexscreener pair page. Takes a pool address, or the mint when the pool is unknown. */
export function dexscreenerUrl(poolOrMint: string): string {
  return `${trim(config.links.dexscreener)}/${config.links.chainSlug}/${poolOrMint}`;
}

/** Dexscreener chart, sized for an iframe. */
export function dexscreenerEmbedUrl(poolOrMint: string): string {
  const params = new URLSearchParams({ embed: '1', theme: 'dark', info: '0' });
  return `${dexscreenerUrl(poolOrMint)}?${params.toString()}`;
}

/** Birdeye token page. */
export function birdeyeTokenUrl(mint: string): string {
  return `${trim(config.links.birdeye)}/token/${mint}?chain=${config.links.chainSlug}`;
}

/** Birdeye chart widget, sized for an iframe. */
export function birdeyeWidgetUrl(mint: string): string {
  const params = new URLSearchParams({
    chain: config.links.chainSlug,
    theme: 'dark',
    chartInterval: '1D',
    chartType: 'CANDLE',
  });
  return `${trim(config.links.birdeye)}/tv-widget/${mint}?${params.toString()}`;
}
