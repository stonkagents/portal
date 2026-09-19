/**
 * Purpose: Cloudflare Turnstile, explicit render (FB-1).
 *
 * The tracker verifies the token server-side when its TURNSTILE_SECRET_KEY is
 * set and skips the check when it is not. The portal mirrors that: with no
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY (`config.turnstile.enabled` false) this
 * renders nothing, produces no token and never blocks a send (dev and devnet
 * run the pair switched off). With a key, the token travels as
 * `x-turnstile-token` on every send that has one.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  appearance?: 'always' | 'execute' | 'interaction-only';
}

export interface TurnstileApi {
  render(el: HTMLElement, opts: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SITE_KEY: string = config.turnstile.siteKey;

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let pending: Promise<TurnstileApi | null> | null = null;

/** Load the challenge script once; resolves null (never rejects) when blocked. */
function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!pending) {
    pending = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve(window.turnstile ?? null);
      s.onerror = () => {
        pending = null; /* a later mount may retry */
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return pending;
}

/**
 * What the widget is doing, so the form can be honest about it: 'off' with no
 * site key, 'loading' until the script lands, 'ready' once rendered, 'failed'
 * when the script never loaded (a blocker, a strict network).
 */
export type TurnstileState = 'off' | 'loading' | 'ready' | 'failed';

export const TURNSTILE_FAILED_NOTE =
  'The human check did not load (a blocker, or a strict network). The send will not go through without it.';

export function TurnstileBox({
  onToken,
  onState,
}: {
  onToken: (token: string | null) => void;
  onState?: (state: TurnstileState) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!TURNSTILE_SITE_KEY || !el) {
      onState?.('off');
      return;
    }
    let widgetId: string | undefined;
    let cancelled = false;
    onState?.('loading');
    void loadTurnstile().then(ts => {
      if (cancelled) return;
      if (!ts) {
        setFailed(true);
        onToken(null);
        onState?.('failed');
        return;
      }
      setFailed(false);
      onState?.('ready');
      widgetId = ts.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: token => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
        appearance: 'interaction-only',
      });
    });
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [onToken, onState]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <div ref={ref} data-testid="turnstile-box" />
      {failed && (
        <p className="m-0 text-xs text-accent-yellow" role="note" data-testid="turnstile-failed">
          {TURNSTILE_FAILED_NOTE}
        </p>
      )}
    </>
  );
}
