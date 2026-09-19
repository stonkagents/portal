/**
 * Purpose: The browser's local network permission, checked before the installer
 *          download. Chrome and Edge (138 and later, on by default from 142) ask
 *          "wants to access devices on your local network" the first time a
 *          public site fetches 127.0.0.1; a Block (or a dismissed prompt) means
 *          the site can never reach the agent, and nothing tells the user why
 *          the agent "does not show up" after the install. So the Download click
 *          triggers that prompt on purpose, reads the answer through the
 *          Permissions API and only then hands out the installer.
 *
 * Browsers without such a permission (Firefox, Safari, older Chrome) report
 * `unsupported` and are never gated. The permission name is not settled
 * across engines, so every known spelling is tried: the spec's
 * "loopback-network" (the agent lives on 127.0.0.1), Chrome's original
 * "local-network-access", and "local-network".
 */

import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';

export type LocalAccessOutcome = 'granted' | 'denied' | 'prompt' | 'unsupported';

export const LOCAL_ACCESS_PERMISSION_NAMES = ['loopback-network', 'local-network-access', 'local-network'] as const;

/** sessionStorage flag: the browser granted local access during this session, no need to ask again. */
export const LOCAL_ACCESS_GRANTED_KEY = 'stonkagents.localAccessGranted';

/** How long the user gets to answer the browser prompt before the gate asks them to try again. */
export const LOCAL_ACCESS_PROMPT_TIMEOUT_MS = 60_000;

/** How long the probe fetch may take once the browser has let it through. */
const PROBE_TIMEOUT_MS = 5_000;

/** The daemon's health URL: the request whose first attempt makes the browser ask. */
export const LOCAL_ACCESS_PROBE_URL = `${DAEMON_API_V1.replace(/\/api\/v1\/?$/, '')}/health`;

/** Whether the Permissions API exists at all (the sync half of the feature test). */
export function permissionsApiPresent(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return typeof nav?.permissions?.query === 'function';
}

/**
 * The local network permission's status, or null when the browser has no such
 * permission (every spelling throws a TypeError there). Never prompts.
 */
export async function queryLocalAccessPermission(
  nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): Promise<PermissionStatus | null> {
  if (!permissionsApiPresent(nav)) return null;
  for (const name of LOCAL_ACCESS_PERMISSION_NAMES) {
    try {
      const status = await nav!.permissions.query({ name: name as PermissionName });
      if (status && typeof status.state === 'string') return status;
    } catch {
      /* not this spelling */
    }
  }
  return null;
}

/**
 * One fetch to the agent's health URL. Its only job is to make the browser
 * show its prompt; whether the agent answers is irrelevant (it is probably not
 * installed yet), so every error is swallowed.
 */
export async function probeLocalAgent(signal?: AbortSignal): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await fetch(LOCAL_ACCESS_PROBE_URL, {
      ...withLoopbackTarget(LOCAL_ACCESS_PROBE_URL, { cache: 'no-store' }),
      signal: controller.signal,
    });
  } catch {
    /* blocked, refused, or nothing listening: all fine */
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export interface LocalAccessCheckDeps {
  /** The permission status, null when the browser has none. */
  query: () => Promise<PermissionStatus | null>;
  /** The request that makes the browser ask. */
  probe: (signal: AbortSignal) => Promise<void>;
  promptTimeoutMs?: number;
}

/** Resolves once the status reports a change, or never. */
function statusChanged(status: PermissionStatus): Promise<void> {
  return new Promise(resolve => status.addEventListener('change', () => resolve(), { once: true }));
}

/**
 * The check behind "Allow and download":
 *   - no permission in this browser: the probe is fired anyway and the download goes ahead (`unsupported`);
 *   - already granted or denied: answered without a probe;
 *   - prompt: the probe makes the browser ask; the answer (a change on the status,
 *     the probe settling, or the timeout) is read back from a fresh query. Still
 *     `prompt` afterwards means the user dismissed the browser's dialog.
 * Anything that throws counts as `unsupported`: the gate must never trap the user.
 */
export async function checkLocalAccess(deps: LocalAccessCheckDeps): Promise<LocalAccessOutcome> {
  try {
    const status = await deps.query();
    if (!status) {
      void deps.probe(new AbortController().signal).catch(() => {});
      return 'unsupported';
    }
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve();
      }, deps.promptTimeoutMs ?? LOCAL_ACCESS_PROMPT_TIMEOUT_MS);
    });
    try {
      await Promise.race([deps.probe(controller.signal).catch(() => {}), statusChanged(status), timeout]);
    } finally {
      clearTimeout(timer);
    }
    const after = (await deps.query()) ?? status;
    return after.state === 'granted' ? 'granted' : after.state === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** The browser defaults: the real Permissions API and the real probe. */
export function checkLocalAccessInBrowser(): Promise<LocalAccessOutcome> {
  return checkLocalAccess({ query: () => queryLocalAccessPermission(), probe: probeLocalAgent });
}

export function localAccessRemembered(): boolean {
  try {
    return sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberLocalAccessGranted(): void {
  try {
    sessionStorage.setItem(LOCAL_ACCESS_GRANTED_KEY, '1');
  } catch {
    /* storage unavailable: the gate simply asks again next time */
  }
}

/**
 * Starts the installer download without a click to lean on: a new tab when the
 * browser allows it, else the same tab (the installer is served as a download,
 * so the page stays).
 */
export function launchDownload(url: string): void {
  let opened: Window | null = null;
  try {
    opened = window.open(url, '_blank');
  } catch {
    opened = null;
  }
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* cross-origin window: nothing to detach */
    }
    return;
  }
  window.location.assign(url);
}
