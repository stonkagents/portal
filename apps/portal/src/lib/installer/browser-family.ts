/**
 * Purpose: Which browser the user is in, read from the user agent, so the
 *          "unblock local access" steps of the gate name the row the way that
 *          browser's site settings do and draw the icon it shows left of the
 *          address bar: Chrome and Edge have "Apps on device" behind a sliders
 *          icon, Firefox and Safari "Local network access" behind a lock. Every
 *          other Chromium build (Brave, Opera, Vivaldi, Arc) has Chrome's panel
 *          and reports as Chrome. SSR-safe: `unknown` until hydrated.
 */
import { useEffect, useState } from 'react';

export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'unknown';

/** The families whose site settings are Chrome's: an "Apps on device" toggle and a "Reset permissions" button. */
export function isChromium(family: BrowserFamily): boolean {
  return family === 'chrome' || family === 'edge';
}

export function detectBrowserFamily(userAgent: string | undefined): BrowserFamily {
  const ua = userAgent ?? '';
  /* Edge first: its user agent also carries "Chrome/". EdgA and EdgiOS are the Android and iOS builds. */
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return 'edge';
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'firefox';
  if (/\bChrome\/|\bCriOS\/|\bChromium\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'safari';
  return 'unknown';
}

export function useBrowserFamily(): BrowserFamily {
  const [family, setFamily] = useState<BrowserFamily>('unknown');
  useEffect(() => {
    setFamily(detectBrowserFamily(typeof navigator === 'undefined' ? undefined : navigator.userAgent));
  }, []);
  return family;
}
