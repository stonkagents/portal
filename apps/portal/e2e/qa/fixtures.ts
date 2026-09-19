/**
 * Shared fixtures for the QA hardening suite (e2e/qa). See README.md next to this file.
 *
 * The suite drives a locally served portal (QA_BASE_URL) whose NEXT_PUBLIC_DAEMON_URL
 * points at a throwaway daemon (QA_DAEMON_URL) registered on the dev tracker. Every spec
 * imports `test` from here, and the daemon probe in `beforeAll` skips the whole file when
 * nothing answers, so a CI box without a QA daemon reports "skipped", never "failed".
 */
import { test as base, expect, type Page, type BrowserContext, type APIRequestContext } from '@playwright/test';

/** Root of the QA daemon (no /api/v1). Mirrors NEXT_PUBLIC_DAEMON_URL of the portal under test. */
export const QA_DAEMON_URL = (process.env.QA_DAEMON_URL || 'http://127.0.0.1:7871').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
/** A second daemon, peer of the first, for the P2P specs. Absent = those specs skip. */
export const QA_DAEMON_B_URL = (process.env.QA_DAEMON_B_URL || 'http://127.0.0.1:7872')
  .replace(/\/api\/v1\/?$/, '')
  .replace(/\/$/, '');
/** Tracker the daemon and the portal talk to. */
export const QA_TRACKER_URL = (process.env.QA_TRACKER_URL || 'https://tracker.dev.stonkagents.com').replace(/\/$/, '');

/** Every post, reply and name the suite writes carries this prefix so the owner can spot it on the board. */
export const QA_PREFIX = '[qa3]';

/** Storage keys the portal reads before its first paint. */
const PROFILE_KEY = 'stonkagents:user';
const SPLASH_KEY = 'stonkagents-splash-seen';

export interface QaDaemonInfo {
  peerId: string;
  version: string;
  trackerUrl: string;
  environment: string;
  registered: boolean;
}

/** GET /api/v1/status of a daemon, or null when it does not answer. */
export async function probeDaemon(request: APIRequestContext, root: string): Promise<QaDaemonInfo | null> {
  try {
    const res = await request.get(`${root}/api/v1/status`, { timeout: 4_000 });
    if (!res.ok()) return null;
    const json = (await res.json()) as {
      daemon?: { peer_id?: string; version?: string };
      tracker_url?: string;
      environment?: string;
      tracker_registered?: boolean;
    };
    return {
      peerId: json.daemon?.peer_id ?? '',
      version: json.daemon?.version ?? '',
      trackerUrl: json.tracker_url ?? '',
      environment: json.environment ?? '',
      registered: json.tracker_registered === true,
    };
  } catch {
    return null;
  }
}

/**
 * A visitor who has been here before: splash dismissed, install recorded, launch card put away.
 * `fresh: true` keeps localStorage empty for the first-visit specs.
 */
export async function seedVisitor(context: BrowserContext, opts: { fresh?: boolean; installed?: boolean } = {}) {
  const { fresh = false, installed = true } = opts;
  await context.addInitScript(
    ({ fresh, installed, PROFILE_KEY, SPLASH_KEY }) => {
      try {
        if (fresh) return;
        const now = Date.now();
        localStorage.setItem(SPLASH_KEY, '1');
        sessionStorage.setItem(SPLASH_KEY, '1');
        localStorage.setItem(
          PROFILE_KEY,
          JSON.stringify({
            firstSeen: now - 86_400_000,
            visitCount: 3,
            hasInstalledDaemon: installed,
            launchedToken: null,
            launchWalletAddress: null,
            connectedSocials: [],
            tokenLaunchDismissed: true,
            lastSeen: now,
          }),
        );
      } catch {
        /* storage unavailable */
      }
    },
    { fresh, installed, PROFILE_KEY, SPLASH_KEY },
  );
}

/** Dismiss the splash when it rendered anyway. */
export async function dismissSplash(page: Page) {
  const splash = page.getByTestId('splash-screen');
  try {
    await splash.waitFor({ state: 'visible', timeout: 1_500 });
    const fix = page.getByTestId('splash-fix-btn');
    if (await fix.isVisible().catch(() => false)) await fix.click();
    await splash.waitFor({ state: 'detached', timeout: 10_000 });
  } catch {
    /* not shown */
  }
}

/** Wait until the navbar shows the daemon as connected (the dot only renders while connected). */
export async function waitForConnected(page: Page, timeout = 20_000) {
  await expect(page.getByTestId('daemon-dot')).toHaveAttribute('aria-label', /Daemon (online|degraded)/, { timeout });
}

/** Wait until the navbar no longer shows the daemon as connected. */
export async function waitForOffline(page: Page, timeout = 20_000) {
  await expect(page.getByTestId('daemon-dot')).toHaveCount(0, { timeout });
}

/** True when the URL is a call to the QA daemon under test. */
export function isDaemonUrl(url: string): boolean {
  return url.startsWith(QA_DAEMON_URL + '/');
}

/** True when the URL is a call to the tracker (direct from the portal, not through the daemon proxy). */
export function isTrackerUrl(url: string): boolean {
  return url.startsWith(QA_TRACKER_URL + '/');
}

/** A short unique tag for content the suite writes, always starting with the QA prefix. */
export function qaTag(label: string): string {
  return `${QA_PREFIX} ${label} ${Date.now().toString(36)}`;
}

type QaFixtures = {
  /** The daemon under test, probed once per worker; the test skips when it is absent. */
  daemon: QaDaemonInfo;
};

export const test = base.extend<QaFixtures>({
  /* auto: the probe runs for every test in the suite, whether or not it reads `daemon`. */
  daemon: [
    async ({ request, baseURL }, use) => {
      const info = await probeDaemon(request, QA_DAEMON_URL);
      test.skip(info === null, `No QA daemon at ${QA_DAEMON_URL} (see e2e/qa/README.md)`);
      const portalUp = await request
        .get(baseURL ?? '', { timeout: 10_000 })
        .then(r => r.ok())
        .catch(() => false);
      test.skip(!portalUp, `No portal at ${baseURL} (see e2e/qa/README.md)`);
      await use(info as QaDaemonInfo);
    },
    { auto: true },
  ],
});

export { expect };

/** A devnet address that holds SOL (the dev tracker's launch treasury), so balance checks pass. */
export const QA_WALLET_ADDRESS = process.env.QA_WALLET_ADDRESS || 'HaKT7Tv8ryZBZTiom5NSdwhahuMFPkEcGvausaNbcZyh';

/**
 * A Wallet Standard wallet the portal's connector discovers like Phantom: it connects to
 * one account and refuses every signature the way a user pressing Cancel does. Wallet flows
 * are driven with it up to the wallet prompt and never past it. `window.__qaWallet` counts
 * the connect and sign requests for the specs.
 */
export async function installFakeWallet(context: BrowserContext, opts: { address?: string } = {}) {
  const address = opts.address ?? QA_WALLET_ADDRESS;
  await context.addInitScript(
    ({ address }) => {
      const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const decode = (s: string) => {
        const bytes: number[] = [];
        for (const ch of s) {
          let carry = ALPHABET.indexOf(ch);
          for (let i = 0; i < bytes.length; i++) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
          }
          while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
          }
        }
        for (const ch of s) {
          if (ch !== '1') break;
          bytes.push(0);
        }
        return new Uint8Array(bytes.reverse());
      };
      const publicKey = decode(address);
      const chains = ['solana:devnet', 'solana:mainnet', 'solana:testnet'];
      const account = {
        address,
        publicKey,
        chains,
        features: ['solana:signTransaction', 'solana:signMessage', 'solana:signAndSendTransaction'],
        label: 'QA account',
      };
      const counters = { connects: 0, signs: 0, calls: [] as string[] };
      (window as unknown as { __qaWallet: typeof counters }).__qaWallet = counters;
      const listeners = new Set<(props: unknown) => void>();
      const reject = (what: string) => {
        counters.signs += 1;
        counters.calls.push(what);
        return Promise.reject(new Error('User rejected the request.'));
      };
      const wallet = {
        version: '1.0.0',
        name: 'QA Wallet',
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjMGY5Ii8+PC9zdmc+',
        chains,
        accounts: [] as (typeof account)[],
        features: {
          'standard:connect': {
            version: '1.0.0',
            connect: async () => {
              counters.connects += 1;
              wallet.accounts = [account];
              listeners.forEach(l => l({ accounts: wallet.accounts }));
              return { accounts: wallet.accounts };
            },
          },
          'standard:disconnect': {
            version: '1.0.0',
            disconnect: async () => {
              wallet.accounts = [];
              listeners.forEach(l => l({ accounts: [] }));
            },
          },
          'standard:events': {
            version: '1.0.0',
            on: (_event: string, listener: (props: unknown) => void) => {
              listeners.add(listener);
              return () => listeners.delete(listener);
            },
          },
          'solana:signTransaction': {
            version: '1.0.0',
            supportedTransactionVersions: ['legacy', 0],
            /* Wallet Standard input is { transaction, account, chain }; the connector first tries a nonstandard
               { transactions: [...] } shape, which a real wallet refuses without a prompt. Only a real prompt counts. */
            signTransaction: (input?: { transaction?: unknown }) =>
              input?.transaction ? reject('signTransaction') : Promise.reject(new TypeError('signTransaction: missing transaction')),
          },
          'solana:signAndSendTransaction': {
            version: '1.0.0',
            supportedTransactionVersions: ['legacy', 0],
            signAndSendTransaction: (input?: { transaction?: unknown }) =>
              input?.transaction
                ? reject('signAndSendTransaction')
                : Promise.reject(new TypeError('signAndSendTransaction: missing transaction')),
          },
          'solana:signMessage': {
            version: '1.0.0',
            signMessage: () => reject('signMessage'),
          },
        },
      };
      const register = (api: { register: (w: unknown) => void }) => api.register(wallet);
      window.addEventListener('wallet-standard:app-ready', (event: Event) => register((event as CustomEvent).detail));
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
    },
    { address },
  );
}
