/**
 * StonkAgents typed runtime configuration.
 *
 * Scope rule: this file carries the cluster, the RPC, the explorer, the tracker
 * host, feature flags and *display* fallbacks. Nothing here is allowed to shape
 * a launch transaction. Every chain value the launch engine needs — program id,
 * platform id, treasury, launch fee, transfer fee, quote list, quote config id,
 * raise size and curve parameters — comes from `GET /api/launch/config` on the
 * tracker. See `src/lib/launchlab/launch-config.ts`.
 *
 * Components import `config` from '@/config' and never touch process.env.
 */

import { PRIMARY_DOMAIN } from '@/lib/product-domains';

export type Cluster = 'devnet' | 'mainnet';

/** The wallet adapter's spelling of the cluster (ConnectorKit, Mobile Wallet Adapter). */
export type WalletNetwork = 'devnet' | 'mainnet-beta';

/** Deployment environment label (`NEXT_PUBLIC_ENV`): dev (default), staging, production. */
export type AppEnv = 'dev' | 'staging' | 'production';

/* Next.js inlines ONLY literal `process.env.NEXT_PUBLIC_*` member reads at build
 * time; a dynamic `process.env[key]` lookup is undefined in the static export.
 * So every key is read literally here, once, and the helpers only apply the
 * fallback. Add new keys to this block, not via a dynamic lookup. */
const RAW: Record<string, string | undefined> = {
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
  NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
  NEXT_PUBLIC_TRACKER_URL: process.env.NEXT_PUBLIC_TRACKER_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN,
  NEXT_PUBLIC_SOL_PRICE_URL: process.env.NEXT_PUBLIC_SOL_PRICE_URL,
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  NEXT_PUBLIC_EXPLORER_BASE_URL: process.env.NEXT_PUBLIC_EXPLORER_BASE_URL,
  NEXT_PUBLIC_EXPLORER_CLUSTER_SUFFIX: process.env.NEXT_PUBLIC_EXPLORER_CLUSTER_SUFFIX,
  NEXT_PUBLIC_RAYDIUM_LAUNCHPAD_URL: process.env.NEXT_PUBLIC_RAYDIUM_LAUNCHPAD_URL,
  NEXT_PUBLIC_JUPITER_URL: process.env.NEXT_PUBLIC_JUPITER_URL,
  NEXT_PUBLIC_DEXSCREENER_URL: process.env.NEXT_PUBLIC_DEXSCREENER_URL,
  NEXT_PUBLIC_BIRDEYE_URL: process.env.NEXT_PUBLIC_BIRDEYE_URL,
  NEXT_PUBLIC_USE_REAL_WALLET: process.env.NEXT_PUBLIC_USE_REAL_WALLET,
  NEXT_PUBLIC_DOCS_ENABLED: process.env.NEXT_PUBLIC_DOCS_ENABLED,
  NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
  NEXT_PUBLIC_GITHUB_URL: process.env.NEXT_PUBLIC_GITHUB_URL,
  NEXT_PUBLIC_X_URL: process.env.NEXT_PUBLIC_X_URL,
  NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  NEXT_PUBLIC_AGENT_HOME: process.env.NEXT_PUBLIC_AGENT_HOME,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
};
const env = (key: string, fallback = ''): string => RAW[key] ?? fallback;
const bool = (key: string, fallback = false): boolean => {
  const v = RAW[key];
  return v === undefined ? fallback : v === 'true' || v === '1';
};

/** One spelling per cluster: 'mainnet-beta' (the wallet adapter's word) and 'mainnet' are the same place. */
function parseCluster(value: string | undefined): Cluster | null {
  const word = (value ?? '').trim().toLowerCase();
  if (word === 'mainnet' || word === 'mainnet-beta') return 'mainnet';
  if (word === 'devnet') return 'devnet';
  return null;
}

/**
 * The one cluster switch. `NEXT_PUBLIC_SOLANA_CLUSTER` (devnet | mainnet) is
 * the source of truth; `NEXT_PUBLIC_SOLANA_NETWORK` (devnet | mainnet-beta) is
 * the legacy alias the wallet provider used to read on its own. The alias is
 * honoured only when the cluster is unset. Set to different places, the
 * cluster wins and the build says so once, because a wallet on one chain and a
 * launch engine on another is the bug this switch exists to prevent.
 */
export function resolveCluster(raw: { cluster?: string; network?: string }, warn: (msg: string) => void = console.error): Cluster {
  const fromCluster = raw.cluster === undefined || raw.cluster === '' ? null : (parseCluster(raw.cluster) ?? 'devnet');
  const fromNetwork = parseCluster(raw.network);
  if (fromCluster !== null && fromNetwork !== null && fromCluster !== fromNetwork) {
    warn(
      `[config] NEXT_PUBLIC_SOLANA_CLUSTER="${raw.cluster ?? ''}" and NEXT_PUBLIC_SOLANA_NETWORK="${raw.network ?? ''}" name different clusters; ` +
        `using NEXT_PUBLIC_SOLANA_CLUSTER (${fromCluster}). Drop NEXT_PUBLIC_SOLANA_NETWORK, it is a legacy alias.`,
    );
  }
  return fromCluster ?? fromNetwork ?? 'devnet';
}

const cluster = resolveCluster({ cluster: RAW.NEXT_PUBLIC_SOLANA_CLUSTER, network: RAW.NEXT_PUBLIC_SOLANA_NETWORK });
const walletNetwork: WalletNetwork = cluster === 'mainnet' ? 'mainnet-beta' : 'devnet';

const appEnvRaw = env('NEXT_PUBLIC_ENV', 'dev');
const appEnv: AppEnv = appEnvRaw === 'production' || appEnvRaw === 'staging' ? appEnvRaw : 'dev';

/**
 * Reduce a configured tracker or API URL to its origin.
 *
 * Deployments spell the same host three ways — `https://tracker.example.com`,
 * `.../api` and `.../api/v1` — and every launch route is mounted under `/api`.
 * Normalising here means a launch call is always `origin + '/api/...'`.
 */
export function trackerOrigin(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api(\/v1)?$/, '');
}

const trackerUrl = trackerOrigin(env('NEXT_PUBLIC_TRACKER_URL', '') || env('NEXT_PUBLIC_API_BASE_URL', ''));
/**
 * Source repository. Empty renders no GitHub link anywhere (footer, avatar menu,
 * drawer, Settings, Contact).
 */
const githubUrl = env('NEXT_PUBLIC_GITHUB_URL', '').trim().replace(/\/+$/, '');

export const config = {
  cluster,
  isDevnet: cluster === 'devnet',
  /** Deployment environment: dev.stonkagents.com runs as 'dev'; anything unrecognised is treated as dev. */
  env: appEnv,
  /** True only on the dev deployment. Dev-only surfaces (the devnet drip) gate on this AND isDevnet. */
  isDevEnv: appEnv === 'dev',

  brand: {
    name: 'StonkAgents',
    /**
     * The public hostname this build names itself by (metadata, sitemap, robots,
     * security.txt, the footer, the docs host). NEXT_PUBLIC_APP_DOMAIN per
     * environment; the default is the primary domain (see lib/product-domains.ts).
     */
    domain: env('NEXT_PUBLIC_APP_DOMAIN', PRIMARY_DOMAIN),
    handle: '@stonkagents',
    /** The one tagline: page title, navbar subtitle, social cards. */
    tagline: 'The first P2P Network for agents',
    /** The one slogan: meta description, footer, share text, the home headline. */
    slogan: 'Permissionless knowledge sharing for StonkAgents',
    networkName: 'The Network',
  },

  api: {
    /**
     * Tracker origin, without a path. `NEXT_PUBLIC_TRACKER_URL` wins;
     * `NEXT_PUBLIC_API_BASE_URL` is accepted so existing deployments keep working.
     */
    trackerUrl,
    /** Base the legacy `apiClient` prepends. Kept for routes outside the launch engine. */
    baseUrl: env('NEXT_PUBLIC_API_BASE_URL', ''),
    /** Public SOL price feed, used only as a display fallback. Queried as `${solPriceUrl}?ids=<mint>`. */
    solPriceUrl: env('NEXT_PUBLIC_SOL_PRICE_URL', 'https://lite-api.jup.ag/price/v3'),
    /** Jupiter's Swap API (quote + swap build), for trading the Network token in the app. Free tier, no key. */
    jupiterSwapUrl: env('NEXT_PUBLIC_JUPITER_SWAP_API_URL', 'https://lite-api.jup.ag/swap/v1'),
  },

  solana: {
    /**
     * The cluster in the wallet adapter's spelling ('devnet' | 'mainnet-beta'),
     * derived from `cluster`. `SolanaProvider` reads this; nothing reads
     * `NEXT_PUBLIC_SOLANA_NETWORK` directly any more.
     */
    walletNetwork,
    rpcUrl: env('NEXT_PUBLIC_SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
    /** Second RPC tried when the first errors or times out; the cluster's public RPC when unset. */
    rpcFallbackUrl: env('NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URL', cluster === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'),
    explorerBaseUrl: env('NEXT_PUBLIC_EXPLORER_BASE_URL', 'https://solscan.io'),
    /** Appended to explorer links, e.g. '?cluster=devnet'. Empty on mainnet. */
    explorerClusterSuffix: env('NEXT_PUBLIC_EXPLORER_CLUSTER_SUFFIX', cluster === 'devnet' ? '?cluster=devnet' : ''),
    /** False keeps every launch and trade on the mock path, with no chain and no wallet. */
    useRealWallet: bool('NEXT_PUBLIC_USE_REAL_WALLET', false),
    /** Wrapped SOL. Used as the id when pricing SOL against USD. */
    wrappedSolMint: 'So11111111111111111111111111111111111111112',
    lamportsPerSol: 1_000_000_000,
  },

  /**
   * Outbound venue hosts for pool cards and share links. A venue swap is a
   * config change, not a grep.
   */
  links: {
    /** Raydium LaunchLab token page, where our tokens live from launch. */
    raydiumLaunchpad: env('NEXT_PUBLIC_RAYDIUM_LAUNCHPAD_URL', 'https://raydium.io/launchpad'),
    /** Jupiter swap, the aggregator route after graduation. */
    jupiter: env('NEXT_PUBLIC_JUPITER_URL', 'https://jup.ag'),
    /** Dexscreener pair pages. */
    dexscreener: env('NEXT_PUBLIC_DEXSCREENER_URL', 'https://dexscreener.com'),
    /** Birdeye token pages and chart widget. */
    birdeye: env('NEXT_PUBLIC_BIRDEYE_URL', 'https://birdeye.so'),
    /** Chain slug Dexscreener, Birdeye and Jupiter use in their paths. */
    chainSlug: 'solana',
    /** Documentation site. Infra owns the hostname; the portal only reads it. */
    docs: env('NEXT_PUBLIC_DOCS_URL', `https://docs.${PRIMARY_DOMAIN}`).replace(/\/+$/, ''),
    /** Source repository and its issue tracker. Empty renders no link. */
    github: githubUrl,
    issues: githubUrl ? `${githubUrl}/issues` : '',
    /** The project's X profile. Empty renders no link; the footer and the contact page check. */
    x: env('NEXT_PUBLIC_X_URL', '').trim().replace(/\/+$/, ''),
    /** Where to reach the team, shown on the contact page and in the footer. Empty renders no link. */
    contactEmail: env('NEXT_PUBLIC_CONTACT_EMAIL', '').trim(),
  },

  /**
   * Paths the local agent uses on the user's machine, as shown in Settings.
   * The daemon owns the real default; this mirrors it for display.
   */
  paths: {
    agentHome: env('NEXT_PUBLIC_AGENT_HOME', '~/.stonkagents').replace(/\/+$/, ''),
  },

  /**
   * Display-only fallbacks, shown before `GET /api/launch/config` answers and
   * when a price feed is unreachable. The chain enforces the real values and the
   * tracker reports them; never build a transaction from these.
   */
  fees: {
    protocolBps: 25,
    platformBps: 100,
    holderTaxBps: 100,
    creatorBps: 0,
    launchFeeUsd: 0.5,
    fallbackSolUsd: 100,
    get totalTradeBps(): number {
      return this.protocolBps + this.platformBps + this.holderTaxBps + this.creatorBps;
    },
  },

  features: {
    knowledgeSync: false,
    agentRuntime: false,
    autonomy: false,
    folders: false,
    sdk: false,
    /**
     * Documentation links are hidden unless NEXT_PUBLIC_DOCS_ENABLED=true: the
     * docs host (docs.<brand domain>) is down, and a build that forgets the flag
     * must not ship dead links.
     */
    docsEnabled: bool('NEXT_PUBLIC_DOCS_ENABLED', false),
  },

  /**
   * Cloudflare Turnstile for the feedback and roadmap-interest forms. An empty
   * site key renders no widget and never blocks a send; the tracker likewise
   * skips verification while its TURNSTILE_SECRET_KEY is unset. Set both or
   * neither.
   */
  turnstile: {
    siteKey: env('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '').trim(),
    get enabled(): boolean {
      return this.siteKey !== '';
    },
  },
} as const;

export type AppConfig = typeof config;

/* ────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────── */

/**
 * Absolute URL for a tracker route.
 *
 * @example trackerEndpoint('/api/launch/config') // https://tracker.example.com/api/launch/config
 */
export function trackerEndpoint(path: string, cfg: AppConfig = config): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${cfg.api.trackerUrl}${suffix}`;
}

/** Explorer path segment per link kind. Solscan and Solana Explorer agree on these. */
const EXPLORER_PATHS: Record<'tx' | 'address' | 'token', string> = {
  tx: 'tx',
  address: 'account',
  token: 'token',
};

/**
 * Build an explorer link for a signature, wallet or mint on the configured cluster.
 *
 * @example explorerUrl('tx', sig) // https://solscan.io/tx/<sig>?cluster=devnet
 */
export function explorerUrl(kind: 'tx' | 'address' | 'token', id: string, cfg: AppConfig = config): string {
  const base = cfg.solana.explorerBaseUrl.replace(/\/+$/, '');
  return `${base}/${EXPLORER_PATHS[kind]}/${encodeURIComponent(id)}${cfg.solana.explorerClusterSuffix}`;
}

/**
 * Render basis points as a percentage string, trimming trailing zeros.
 *
 * @example formatBps(225) // '2.25%'
 * @example formatBps(100) // '1%'
 */
export function formatBps(bps: number): string {
  if (!Number.isFinite(bps)) return '0%';
  const pct = bps / 100;
  const rounded = Math.round(pct * 10000) / 10000;
  return `${String(rounded)}%`;
}

/* ────────────────────────────────────────────────────────────
   Startup assertion
   ──────────────────────────────────────────────────────────── */

/** Keys that must be present before the app may put a real wallet on a real chain. */
const REQUIRED_FOR_REAL_WALLET: ReadonlyArray<{ envKey: string; path: string; read: (c: AppConfig) => string }> = [
  { envKey: 'NEXT_PUBLIC_TRACKER_URL', path: 'api.trackerUrl', read: c => c.api.trackerUrl },
  { envKey: 'NEXT_PUBLIC_SOLANA_RPC_URL', path: 'solana.rpcUrl', read: c => c.solana.rpcUrl },
];

export class ConfigError extends Error {
  constructor(
    message: string,
    /** The `NEXT_PUBLIC_*` variables that were empty. */
    public readonly missing: string[],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Fail loudly when the app is pointed at a real wallet without the values every
 * live flow needs. Called automatically at module load in production; safe to
 * call by hand in a test or a script.
 *
 * @throws {ConfigError} when `solana.useRealWallet` is true and a required key is empty.
 */
export function assertConfig(cfg: AppConfig = config): void {
  if (!cfg.solana.useRealWallet) return;

  const missing = REQUIRED_FOR_REAL_WALLET.filter(entry => entry.read(cfg).trim() === '');
  if (missing.length === 0) return;

  const lines = missing.map(entry => `  - ${entry.envKey} (config.${entry.path})`).join('\n');
  throw new ConfigError(
    `StonkAgents config is incomplete for NEXT_PUBLIC_USE_REAL_WALLET=true on cluster "${cfg.cluster}".\n` +
      `Set these environment variables (see the portal's .env.example):\n${lines}`,
    missing.map(entry => entry.envKey),
  );
}

if (process.env.NODE_ENV === 'production') {
  assertConfig();
}
