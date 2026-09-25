/**
 * The CSP's connect-src follows the environment. The agent and its controller are named
 * by the env as loopback origins with a port (127.0.0.1:7861 on dev), and the literal
 * localhost entries do not cover 127.0.0.1, so the exact origins must be allowed or the
 * browser refuses every probe and the site never sees an installed agent (dev, 2026-09-17).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: {
    daemonUrl: 'http://127.0.0.1:7861/api/v1',
    controllerUrl: 'http://127.0.0.1:7860',
    downloadBaseUrl: 'https://releases.dev.stonkagents.com',
    trackerUrl: 'https://tracker.dev.stonkagents.com',
    apiBaseUrl: 'https://tracker.dev.stonkagents.com',
    useRealDaemon: true,
  },
}));

import { connectSources, CSP, TURNSTILE_ORIGIN } from '../csp';

describe('connect-src', () => {
  it('allows the agent and controller origins the env names, with their websocket forms', () => {
    const sources = connectSources().split(' ');
    for (const origin of ['http://127.0.0.1:7861', 'ws://127.0.0.1:7861', 'http://127.0.0.1:7860', 'ws://127.0.0.1:7860']) {
      expect(sources).toContain(origin);
    }
    expect(sources).toContain('http://localhost:*');
    expect(sources).toContain('https://releases.dev.stonkagents.com');
  });

  it('is what the meta tag carries', () => {
    expect(CSP).toContain(`connect-src ${connectSources()}`);
    expect(CSP).toContain("object-src 'none'");
  });
});

/**
 * Production sets NEXT_PUBLIC_TURNSTILE_SITE_KEY, so the human check on the feedback and
 * interest forms loads a Cloudflare script and renders a frame. With the origin missing from
 * script-src the script was blocked, no token was produced, and the tracker answered every
 * send with 403 TURNSTILE_FAILED (production, 2026-09-23).
 */
describe('Turnstile', () => {
  it('may load its script, open its frame and reach its API', () => {
    const script = CSP.split('; ').find(d => d.startsWith('script-src '));
    const frame = CSP.split('; ').find(d => d.startsWith('frame-src '));
    expect(script).toContain(TURNSTILE_ORIGIN);
    expect(frame).toContain(TURNSTILE_ORIGIN);
    expect(connectSources().split(' ')).toContain(TURNSTILE_ORIGIN);
  });
});
