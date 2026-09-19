/**
 * Typed runtime configuration.
 *
 * The config module reads process.env once at import time, so every case here
 * resets the module registry and re-imports it with a fresh environment.
 * Nothing that shapes a launch transaction lives here: the launch config
 * comes from the tracker (see `src/lib/launchlab/launch-config.test.ts`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as ConfigModuleShape from '../index';

type ConfigModule = typeof ConfigModuleShape;

const loadConfig = async (env: Record<string, string> = {}): Promise<ConfigModule> => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('../index');
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('config defaults', () => {
  it('falls back to devnet when the cluster is unset', async () => {
    const { config } = await loadConfig();
    expect(config.cluster).toBe('devnet');
    expect(config.isDevnet).toBe(true);
    expect(config.solana.explorerClusterSuffix).toBe('?cluster=devnet');
  });

  it('treats any non-mainnet cluster value as devnet', async () => {
    const { config } = await loadConfig({ NEXT_PUBLIC_SOLANA_CLUSTER: 'testnet' });
    expect(config.cluster).toBe('devnet');
  });

  it('reads mainnet when asked', async () => {
    const { config } = await loadConfig({ NEXT_PUBLIC_SOLANA_CLUSTER: 'mainnet' });
    expect(config.cluster).toBe('mainnet');
    expect(config.isDevnet).toBe(false);
    expect(config.solana.explorerClusterSuffix).toBe('');
  });

  it('hides documentation links unless NEXT_PUBLIC_DOCS_ENABLED is true (the docs host is down)', async () => {
    expect((await loadConfig()).config.features.docsEnabled).toBe(false);
    expect((await loadConfig({ NEXT_PUBLIC_DOCS_ENABLED: 'false' })).config.features.docsEnabled).toBe(false);
    expect((await loadConfig({ NEXT_PUBLIC_DOCS_ENABLED: 'true' })).config.features.docsEnabled).toBe(true);
  });

  it('reads the Turnstile site key and reports the widget off when it is empty', async () => {
    expect((await loadConfig()).config.turnstile).toMatchObject({ siteKey: '', enabled: false });
    expect((await loadConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: '  ' })).config.turnstile.enabled).toBe(false);
    expect((await loadConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x000' })).config.turnstile).toMatchObject({ siteKey: '1x000', enabled: true });
  });
});

describe('one cluster switch', () => {
  it('derives the wallet network from the cluster', async () => {
    expect((await loadConfig()).config.solana.walletNetwork).toBe('devnet');
    expect((await loadConfig({ NEXT_PUBLIC_SOLANA_CLUSTER: 'mainnet' })).config.solana.walletNetwork).toBe('mainnet-beta');
  });

  it('accepts the legacy NEXT_PUBLIC_SOLANA_NETWORK alias when the cluster is unset', async () => {
    const { config } = await loadConfig({ NEXT_PUBLIC_SOLANA_NETWORK: 'mainnet-beta' });
    expect(config.cluster).toBe('mainnet');
    expect(config.solana.walletNetwork).toBe('mainnet-beta');
    expect(config.solana.explorerClusterSuffix).toBe('');
    expect((await loadConfig({ NEXT_PUBLIC_SOLANA_NETWORK: 'devnet' })).config.cluster).toBe('devnet');
  });

  it('agrees silently when both name the same place', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { config } = await loadConfig({ NEXT_PUBLIC_SOLANA_CLUSTER: 'mainnet', NEXT_PUBLIC_SOLANA_NETWORK: 'mainnet-beta' });
    expect(config.cluster).toBe('mainnet');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('prefers NEXT_PUBLIC_SOLANA_CLUSTER and logs once when the two disagree', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { config } = await loadConfig({ NEXT_PUBLIC_SOLANA_CLUSTER: 'devnet', NEXT_PUBLIC_SOLANA_NETWORK: 'mainnet-beta' });
    expect(config.cluster).toBe('devnet');
    expect(config.solana.walletNetwork).toBe('devnet');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toMatch(/NEXT_PUBLIC_SOLANA_CLUSTER.*NEXT_PUBLIC_SOLANA_NETWORK.*different clusters/);
    error.mockRestore();
  });

  it('resolveCluster ignores an unknown alias value and an empty cluster', async () => {
    const { resolveCluster } = await loadConfig();
    const warn = vi.fn();
    expect(resolveCluster({ cluster: '', network: 'mainnet-beta' }, warn)).toBe('mainnet');
    expect(resolveCluster({ cluster: 'mainnet', network: 'testnet' }, warn)).toBe('mainnet');
    expect(resolveCluster({ network: 'testnet' }, warn)).toBe('devnet');
    expect(resolveCluster({ cluster: 'MAINNET-BETA' }, warn)).toBe('mainnet');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads the deployment environment, defaulting to dev', async () => {
    expect((await loadConfig()).config.env).toBe('dev');
    expect((await loadConfig()).config.isDevEnv).toBe(true);
    expect((await loadConfig({ NEXT_PUBLIC_ENV: 'staging' })).config.env).toBe('staging');
    expect((await loadConfig({ NEXT_PUBLIC_ENV: 'production' })).config.env).toBe('production');
    expect((await loadConfig({ NEXT_PUBLIC_ENV: 'production' })).config.isDevEnv).toBe(false);
    expect((await loadConfig({ NEXT_PUBLIC_ENV: 'prod' })).config.env).toBe('dev');
  });

  it('carries no launch parameters', async () => {
    const { config } = await loadConfig();
    const keys = JSON.stringify(config).toLowerCase();
    for (const forbidden of ['programid', 'platformid', 'treasury', 'configid', 'quotemint']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('reads booleans from "true" and "1" only', async () => {
    expect((await loadConfig({ NEXT_PUBLIC_USE_REAL_WALLET: 'true' })).config.solana.useRealWallet).toBe(true);
    expect((await loadConfig({ NEXT_PUBLIC_USE_REAL_WALLET: '1' })).config.solana.useRealWallet).toBe(true);
    expect((await loadConfig({ NEXT_PUBLIC_USE_REAL_WALLET: 'yes' })).config.solana.useRealWallet).toBe(false);
    expect((await loadConfig()).config.solana.useRealWallet).toBe(false);
  });

  it('names the brand in the new vocabulary', async () => {
    const { config } = await loadConfig();
    expect(config.brand.name).toBe('StonkAgents');
    expect(config.brand.handle).toBe('@stonkagents');
    expect(config.brand.domain).toBe('stonkagents.com');
  });
});

describe('tracker url', () => {
  it('prefers NEXT_PUBLIC_TRACKER_URL and strips an /api or /api/v1 suffix', async () => {
    const { config } = await loadConfig({
      NEXT_PUBLIC_TRACKER_URL: 'https://tracker.example/api/v1/',
      NEXT_PUBLIC_API_BASE_URL: 'https://other.example',
    });
    expect(config.api.trackerUrl).toBe('https://tracker.example');
  });

  it('falls back to NEXT_PUBLIC_API_BASE_URL so existing deployments keep working', async () => {
    const { config } = await loadConfig({ NEXT_PUBLIC_API_BASE_URL: 'https://tracker.example/api' });
    expect(config.api.trackerUrl).toBe('https://tracker.example');
  });

  it('is empty when nothing is set', async () => {
    const { config } = await loadConfig();
    expect(config.api.trackerUrl).toBe('');
  });

  it('builds launch endpoints under /api', async () => {
    const { trackerEndpoint, trackerOrigin } = await loadConfig({ NEXT_PUBLIC_TRACKER_URL: 'https://tracker.example' });
    expect(trackerEndpoint('/api/launch/config')).toBe('https://tracker.example/api/launch/config');
    expect(trackerEndpoint('api/launches')).toBe('https://tracker.example/api/launches');
    expect(trackerOrigin('https://t.example/api/v1')).toBe('https://t.example');
    expect(trackerOrigin('https://t.example/')).toBe('https://t.example');
  });
});

describe('venue links', () => {
  it('defaults to the public venue hosts', async () => {
    const { config } = await loadConfig();
    expect(config.links).toEqual({
      raydiumLaunchpad: 'https://raydium.io/launchpad',
      jupiter: 'https://jup.ag',
      dexscreener: 'https://dexscreener.com',
      birdeye: 'https://birdeye.so',
      chainSlug: 'solana',
      docs: 'https://docs.stonkagents.com',
      github: '',
      issues: '',
      x: '',
      contactEmail: '',
    });
  });

  it('reads the GitHub URL, trimmed, and derives the issues link from it', async () => {
    const { config } = await loadConfig({ NEXT_PUBLIC_GITHUB_URL: ' https://github.com/stonkagents/ ' });
    expect(config.links.github).toBe('https://github.com/stonkagents');
    expect(config.links.issues).toBe('https://github.com/stonkagents/issues');
  });


  it('reads the X profile and the contact mailbox, trimmed, empty when unset', async () => {
    const { config } = await loadConfig({ NEXT_PUBLIC_X_URL: ' https://x.com/stonkagents/ ', NEXT_PUBLIC_CONTACT_EMAIL: ' hello@stonkagents.com ' });
    expect(config.links.x).toBe('https://x.com/stonkagents');
    expect(config.links.contactEmail).toBe('hello@stonkagents.com');
  });

  it('lets the environment move every venue', async () => {
    const { config } = await loadConfig({
      NEXT_PUBLIC_RAYDIUM_LAUNCHPAD_URL: 'https://beta.raydium.io/launchpad',
      NEXT_PUBLIC_JUPITER_URL: 'https://jup.example',
      NEXT_PUBLIC_DEXSCREENER_URL: 'https://dex.example',
      NEXT_PUBLIC_BIRDEYE_URL: 'https://bird.example',
    });
    expect(config.links.raydiumLaunchpad).toBe('https://beta.raydium.io/launchpad');
    expect(config.links.jupiter).toBe('https://jup.example');
    expect(config.links.dexscreener).toBe('https://dex.example');
    expect(config.links.birdeye).toBe('https://bird.example');
  });
});

describe('display fee fallbacks', () => {
  it('totals 2.25% with the default split', async () => {
    const { config } = await loadConfig();
    expect(config.fees.protocolBps).toBe(25);
    expect(config.fees.platformBps).toBe(100);
    expect(config.fees.holderTaxBps).toBe(100);
    expect(config.fees.creatorBps).toBe(0);
    expect(config.fees.totalTradeBps).toBe(225);
  });

  it('shows a $0.50 launch fee and a fallback SOL price before the tracker answers', async () => {
    const { config } = await loadConfig();
    expect(config.fees.launchFeeUsd).toBe(0.5);
    expect(config.fees.fallbackSolUsd).toBe(100);
  });
});

describe('formatBps', () => {
  it('renders the default trade fee', async () => {
    const { formatBps, config } = await loadConfig();
    expect(formatBps(config.fees.totalTradeBps)).toBe('2.25%');
  });

  it('trims trailing zeros', async () => {
    const { formatBps } = await loadConfig();
    expect(formatBps(100)).toBe('1%');
    expect(formatBps(25)).toBe('0.25%');
    expect(formatBps(0)).toBe('0%');
    expect(formatBps(10000)).toBe('100%');
  });

  it('survives a non-finite input', async () => {
    const { formatBps } = await loadConfig();
    expect(formatBps(Number.NaN)).toBe('0%');
  });
});

describe('explorerUrl', () => {
  it('links a transaction on devnet', async () => {
    const { explorerUrl } = await loadConfig();
    expect(explorerUrl('tx', 'Sig123')).toBe('https://solscan.io/tx/Sig123?cluster=devnet');
  });

  it('uses the account path for an address and the token path for a mint', async () => {
    const { explorerUrl } = await loadConfig();
    expect(explorerUrl('address', 'Wallet1')).toBe('https://solscan.io/account/Wallet1?cluster=devnet');
    expect(explorerUrl('token', 'Mint1')).toBe('https://solscan.io/token/Mint1?cluster=devnet');
  });

  it('drops the cluster suffix on mainnet', async () => {
    const { explorerUrl } = await loadConfig({ NEXT_PUBLIC_SOLANA_CLUSTER: 'mainnet' });
    expect(explorerUrl('tx', 'Sig123')).toBe('https://solscan.io/tx/Sig123');
  });

  it('tolerates a trailing slash on the explorer base url', async () => {
    const { explorerUrl } = await loadConfig({ NEXT_PUBLIC_EXPLORER_BASE_URL: 'https://explorer.example/' });
    expect(explorerUrl('tx', 'Sig123')).toBe('https://explorer.example/tx/Sig123?cluster=devnet');
  });

  it('escapes the id', async () => {
    const { explorerUrl } = await loadConfig();
    expect(explorerUrl('address', 'a b')).toBe('https://solscan.io/account/a%20b?cluster=devnet');
  });
});

describe('assertConfig', () => {
  const liveEnv = {
    NEXT_PUBLIC_USE_REAL_WALLET: 'true',
    NEXT_PUBLIC_TRACKER_URL: 'https://tracker.example',
    NEXT_PUBLIC_SOLANA_RPC_URL: 'https://rpc.example',
  };

  it('is a no-op on the mock path even with everything empty', async () => {
    const { assertConfig } = await loadConfig({ NEXT_PUBLIC_SOLANA_RPC_URL: '' });
    expect(() => assertConfig()).not.toThrow();
  });

  it('passes with a real wallet when the tracker and the RPC are set', async () => {
    const { assertConfig } = await loadConfig(liveEnv);
    expect(() => assertConfig()).not.toThrow();
  });

  it.each([['NEXT_PUBLIC_TRACKER_URL'], ['NEXT_PUBLIC_SOLANA_RPC_URL']])('throws with a real wallet when %s is empty', async key => {
    const { assertConfig, ConfigError } = await loadConfig({ ...liveEnv, [key]: '' });
    expect(() => assertConfig()).toThrow(ConfigError);
    try {
      assertConfig();
    } catch (error) {
      expect((error as InstanceType<typeof ConfigError>).missing).toEqual([key]);
      expect((error as Error).message).toContain(key);
    }
  });

  it('rejects whitespace-only values', async () => {
    const { assertConfig } = await loadConfig({ ...liveEnv, NEXT_PUBLIC_TRACKER_URL: '   ' });
    expect(() => assertConfig()).toThrow(/NEXT_PUBLIC_TRACKER_URL/);
  });

  it('throws at module load in a production real-wallet build', async () => {
    await expect(loadConfig({ ...liveEnv, NEXT_PUBLIC_TRACKER_URL: '', NODE_ENV: 'production' })).rejects.toThrow(
      /NEXT_PUBLIC_TRACKER_URL/,
    );
  });

  it('does not throw at module load in a production mock build', async () => {
    await expect(loadConfig({ NODE_ENV: 'production' })).resolves.toBeDefined();
  });
});
