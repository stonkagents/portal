/**
 * Purpose: The portal's Content-Security-Policy. connect-src is built from config so the
 *          hosts the browser may open connections to follow the environment: the tracker,
 *          the RPCs, the price and swap APIs, the releases host, and the installed agent
 *          and controller on loopback (by the exact origin the env names, 127.0.0.1 or
 *          localhost, either port), plus fixed third parties.
 */
import { config } from '@/config';
import { STONKFUN_SITE } from '@/lib/api/stonkfun';
import { appConfig } from '@/lib/config/app.config';

/**
 * Cloudflare Turnstile. The human check on the feedback and interest forms loads its
 * script from here and renders in a frame served from here, so the origin has to be in
 * script-src, frame-src and connect-src. Without it the script is blocked, the widget
 * never produces a token, and a tracker with TURNSTILE_SECRET_KEY set answers every
 * send with 403 TURNSTILE_FAILED (which is what production did before this was added).
 */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Hosts the browser may open connections to. Infrastructure hosts come from
 * config (env), never a hardcoded domain; the rest are fixed third parties.
 */
export function connectSources(): string {
  const own = new Set<string>();
  for (const raw of [
    config.api.trackerUrl,
    config.api.baseUrl,
    // The installed agent and its controller: the portal talks to them on loopback, and the
    // env names them by port (127.0.0.1:7861 on dev, 7851 on staging, 7841 in production), so
    // the literal localhost entries below are not enough on their own.
    appConfig.daemonUrl,
    appConfig.controllerUrl,
    config.solana.rpcUrl,
    config.solana.rpcFallbackUrl,
    config.api.solPriceUrl,
    // The Network token is bought and sold in the app through Jupiter's Swap API.
    config.api.jupiterSwapUrl,
    appConfig.downloadBaseUrl,
  ]) {
    try {
      const url = new URL(raw);
      own.add(`${url.protocol}//${url.host}`);
      if (url.protocol === 'https:') own.add(`wss://${url.host}`);
      if (url.protocol === 'http:') own.add(`ws://${url.host}`);
    } catch {
      /* empty or relative value: nothing to allow */
    }
  }
  return [
    "'self'",
    'http://localhost:*',
    'ws://localhost:*',
    'wss://localhost:*',
    ...own,
    'https://api.coingecko.com',
    'https://api.dexscreener.com',
    // The Network token via stonkfun (NEXT_PUBLIC_AGENT_SOURCE=stonkfun) reads its public API.
    STONKFUN_SITE,
    'https://ipfs.io',
    'https://*.alchemy.com',
    'wss://*.alchemy.com',
    'https://*.solana.com',
    'wss://*.solana.com',
    'https://api.pinata.cloud',
    'https://gateway.pinata.cloud',
    // Cloudflare Turnstile: the widget posts the challenge from its frame. Harmless where
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY is empty, since nothing loads the script there.
    TURNSTILE_ORIGIN,
  ].join(' ');
}

/** The page's Content-Security-Policy (the meta tag in the root layout). */
export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${TURNSTILE_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src ${connectSources()}`,
  `frame-src ${config.links.birdeye} ${config.links.dexscreener} ${TURNSTILE_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
