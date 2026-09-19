/**
 * Purpose: OS-aware installer URLs from the releases manifest, shared by the
 *          home hero and the chat daemon setup panel, plus the one platform
 *          detection the daemon layer gates on (PERF-3).
 *
 * There is no guessed fallback URL: when the manifest is unreachable the hook
 * reports `manifestState: 'unavailable'` and the UI offers a retry, rather
 * than handing the visitor a link to a file that may not exist (RUN-1).
 *
 * The installer is Step 2 of the product: it is only handed out once the
 * connected wallet has launched a token. Callers pass `unlocked`; while it is
 * false the manifest is still read (so the unlock is instant) but every URL
 * the hook returns is undefined, so no consumer can show a link by accident.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMacOSInstallerUrl, getWindowsInstallerUrl } from '@/lib/api/manifest';

export type DetectedOS = 'macos' | 'windows' | 'unknown';

/** Where the visitor is. Only platforms with an available installer may ever talk to localhost. */
export type Platform = 'windows' | 'macos' | 'ios' | 'android' | 'other';

export type InstallerDownloads = Record<'macos' | 'windows', string | undefined>;

/** Whether the manifest answered: loading until the first attempt settles. */
export type ManifestState = 'loading' | 'ready' | 'unavailable';

const NO_DOWNLOADS: InstallerDownloads = { macos: undefined, windows: undefined };

/** Per-OS installer availability. The macOS installer is not shipping yet. */
export const INSTALLER_AVAILABILITY: Record<'macos' | 'windows', 'available' | 'coming_soon'> = {
  macos: 'coming_soon',
  windows: 'available',
};

export function isInstallerAvailable(os: DetectedOS): boolean {
  return os !== 'unknown' && INSTALLER_AVAILABILITY[os] === 'available';
}

/**
 * Platform from the user agent. Phones and tablets are checked before the
 * desktop patterns because iPhone and iPad user agents contain "Mac OS X"
 * (and iPadOS reports as a Macintosh with a touch screen).
 */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'macos';
  return 'other';
}

/** The platform of the current browser; 'other' during SSR. */
export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/**
 * Whether the agent (daemon) can run here at all. This is the single gate for
 * every localhost probe: INSTALLER_AVAILABILITY is the truth, and a platform
 * without an available installer never opens a connection to localhost.
 */
export function platformSupportsAgent(platform: Platform): boolean {
  return (platform === 'windows' || platform === 'macos') && INSTALLER_AVAILABILITY[platform] === 'available';
}

/** The installer OS a platform maps to, for download links. */
export function platformToOS(platform: Platform): DetectedOS {
  if (platform === 'windows' || platform === 'macos') return platform;
  return 'unknown';
}

/** Placeholder copy for every surface that would show the installer before the wallet has launched. */
export const INSTALLER_LOCKED_MESSAGE = 'Launch your token first. The installer unlocks right after.';

/**
 * @param unlocked whether the connected wallet has launched a token. Locked
 *        means `downloadUrl` is undefined and `downloads` is empty, whatever
 *        the manifest says.
 */
export function useInstallerDownloads(unlocked: boolean) {
  const [os, setOs] = useState<DetectedOS>('unknown');
  const [manifestDownloads, setDownloads] = useState<InstallerDownloads>(NO_DOWNLOADS);
  const [manifestState, setManifestState] = useState<ManifestState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setOs(platformToOS(currentPlatform()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setManifestState('loading');

    async function fetchDownloadUrls() {
      try {
        const [macosUrl, windowsUrl] = await Promise.all([getMacOSInstallerUrl(), getWindowsInstallerUrl()]);
        if (cancelled) return;
        const next: InstallerDownloads = { macos: macosUrl || undefined, windows: windowsUrl || undefined };
        setDownloads(next);
        /* The manifest counts as answered only when it names at least one available installer. */
        const anyAvailable = (['macos', 'windows'] as const).some(o => isInstallerAvailable(o) && next[o]);
        setManifestState(anyAvailable ? 'ready' : 'unavailable');
      } catch (error) {
        if (cancelled) return;
        console.error('[useInstallerDownloads] Failed to fetch manifest URLs', error);
        setDownloads(NO_DOWNLOADS);
        setManifestState('unavailable');
      }
    }

    void fetchDownloadUrls();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Ask the manifest again ("Download unavailable, try again"). */
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  /* Locked: nothing leaves this hook with a URL in it. */
  const downloads = unlocked ? manifestDownloads : NO_DOWNLOADS;

  /** The installer for this browser, only when unlocked, the manifest named one and the platform has an installer. */
  const downloadUrl = os !== 'unknown' && isInstallerAvailable(os) ? downloads[os] : undefined;

  return { os, downloadUrl, downloads, manifestState, retry, unlocked };
}
