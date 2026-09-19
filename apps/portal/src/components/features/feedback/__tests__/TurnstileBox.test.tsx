/**
 * Purpose: Tests for the Turnstile field (FB-1): nothing rendered and the form
 *          left bare without NEXT_PUBLIC_TURNSTILE_SITE_KEY; with a key, the
 *          script loads once, the widget renders with that key, and a blocked
 *          script reports 'failed' with the note.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const SITE_KEY = '1x00000000000000000000AA';

/** The module reads config at import time, so each case re-imports with its own environment. */
async function loadTurnstile(siteKey?: string) {
  vi.resetModules();
  if (siteKey !== undefined) vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', siteKey);
  return import('../TurnstileBox');
}

beforeEach(() => {
  vi.unstubAllEnvs();
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach(s => s.remove());
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.turnstile;
});

describe('TurnstileBox without a site key', () => {
  it('renders nothing, reports off and never loads the challenge script', async () => {
    const { TurnstileBox } = await loadTurnstile();
    const onToken = vi.fn();
    const onState = vi.fn();
    render(<TurnstileBox onToken={onToken} onState={onState} />);
    expect(screen.queryByTestId('turnstile-box')).not.toBeInTheDocument();
    expect(onState).toHaveBeenCalledWith('off');
    expect(onToken).not.toHaveBeenCalled();
    expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });

  it('treats a blank key the same as none', async () => {
    const { TurnstileBox } = await loadTurnstile('   ');
    const onState = vi.fn();
    render(<TurnstileBox onToken={vi.fn()} onState={onState} />);
    expect(screen.queryByTestId('turnstile-box')).not.toBeInTheDocument();
    expect(onState).toHaveBeenCalledWith('off');
  });
});

describe('TurnstileBox with a site key', () => {
  it('loads the script once and renders the widget with the configured key', async () => {
    const { TurnstileBox } = await loadTurnstile(SITE_KEY);
    const render$ = vi.fn(() => 'widget-1');
    const remove = vi.fn();
    const onToken = vi.fn();
    const onState = vi.fn();
    const view = render(<TurnstileBox onToken={onToken} onState={onState} />);
    expect(screen.getByTestId('turnstile-box')).toBeInTheDocument();
    expect(onState).toHaveBeenCalledWith('loading');

    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]');
    expect(script).not.toBeNull();
    expect(script!.src).toContain('render=explicit');
    window.turnstile = { render: render$, reset: vi.fn(), remove };
    act(() => script!.onload?.(new Event('load')));

    await waitFor(() => expect(render$).toHaveBeenCalledTimes(1));
    expect(onState).toHaveBeenLastCalledWith('ready');
    const [, opts] = render$.mock.calls[0] as unknown as [HTMLElement, { sitekey: string; callback: (t: string) => void }];
    expect(opts.sitekey).toBe(SITE_KEY);
    opts.callback('ts-token');
    expect(onToken).toHaveBeenCalledWith('ts-token');

    view.unmount();
    expect(remove).toHaveBeenCalledWith('widget-1');
  });

  it('reports failed with the note when the script never loads, and clears the token', async () => {
    const { TurnstileBox, TURNSTILE_FAILED_NOTE } = await loadTurnstile(SITE_KEY);
    const onToken = vi.fn();
    const onState = vi.fn();
    render(<TurnstileBox onToken={onToken} onState={onState} />);
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]');
    act(() => script!.onerror?.(new Event('error')));
    await waitFor(() => expect(screen.getByTestId('turnstile-failed')).toHaveTextContent(TURNSTILE_FAILED_NOTE));
    expect(onState).toHaveBeenLastCalledWith('failed');
    expect(onToken).toHaveBeenCalledWith(null);
  });
});
