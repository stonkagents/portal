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

import { connectSources, CSP } from '../csp';

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
