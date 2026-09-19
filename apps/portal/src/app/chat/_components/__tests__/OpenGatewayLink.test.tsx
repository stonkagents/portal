import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { parseGatewayLink } from '@/lib/api/daemon-gateway';
import type * as CommandToolsHooks from '@/lib/api/hooks/use-command-tools';

const link = vi.hoisted(() => ({ value: null as null | { url: string; dashboardUrl: string; running: boolean } }));
vi.mock('@/lib/api/hooks/use-gateway-link', () => ({ useGatewayLink: () => ({ data: link.value }) }));

const tools = vi.hoisted(() => ({ value: null as null | { state: string; supported: boolean } }));
vi.mock('@/lib/api/hooks/use-command-tools', async importOriginal => {
  const actual = await importOriginal<typeof CommandToolsHooks>();
  return { ...actual, useCommandTools: () => ({ data: tools.value }) };
});

import { OpenGatewayLink, gatewayBlockedTitle } from '../OpenGatewayLink';

function renderLink() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <OpenGatewayLink />
    </QueryClientProvider>,
  );
}

describe('OpenGatewayLink', () => {
  it('is hidden until the agent reports a gateway', () => {
    link.value = null;
    renderLink();
    expect(screen.queryByTestId('ac-open-gateway')).toBeNull();
  });

  it('opens the signed-in dashboard link in a new tab', () => {
    link.value = { url: 'http://127.0.0.1:19001', dashboardUrl: 'http://127.0.0.1:19001/#token=t', running: true };
    renderLink();
    const a = screen.getByTestId('ac-open-gateway');
    expect(a).toHaveAttribute('href', 'http://127.0.0.1:19001/#token=t');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('data-running', 'true');
    expect(a).toHaveTextContent('Open OpenClaw');
  });

  it('is disabled with a reason while the command tools job runs or has failed', () => {
    link.value = { url: 'http://127.0.0.1:19001', dashboardUrl: 'http://127.0.0.1:19001/#token=t', running: false };
    tools.value = { state: 'running', supported: true };
    const { rerender } = renderLink();
    let el = screen.getByTestId('ac-open-gateway');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('aria-disabled', 'true');
    expect(el).toHaveAttribute('data-blocked', 'running');
    expect(el).toHaveAttribute('title', gatewayBlockedTitle('running', k => k));
    tools.value = { state: 'failed', supported: true };
    rerender(<OpenGatewayLink />);
    el = screen.getByTestId('ac-open-gateway');
    expect(el).toHaveAttribute('data-blocked', 'failed');
    expect(el).toHaveAttribute('title', gatewayBlockedTitle('failed', k => k, null));
    // Done, unknown (older agent) or off Windows: the link is back.
    for (const value of [{ state: 'ready', supported: true }, null, { state: 'running', supported: false }]) {
      tools.value = value;
      rerender(<OpenGatewayLink />);
      expect(screen.getByTestId('ac-open-gateway').tagName).toBe('A');
    }
    tools.value = null;
  });
});

describe('parseGatewayLink', () => {
  it('reads the envelope and builds a dashboard link when only the base is known', () => {
    expect(parseGatewayLink({ data: { url: 'http://127.0.0.1:19002', dashboardUrl: 'http://127.0.0.1:19002/#token=x', running: false } })).toEqual({
      url: 'http://127.0.0.1:19002',
      dashboardUrl: 'http://127.0.0.1:19002/#token=x',
      running: false,
    });
    expect(parseGatewayLink({ data: { url: 'http://127.0.0.1:18789/' } })?.dashboardUrl).toBe('http://127.0.0.1:18789/');
    expect(parseGatewayLink({ error: { code: 'NOT_FOUND' } })).toBeNull();
  });
});
