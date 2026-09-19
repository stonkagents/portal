/**
 * Purpose: Tests for the command tools notice: the "up to 10 minutes" sentence
 *          with the job's phase and detail while it runs or has not started,
 *          the failed sentence with the error and Retry, and the wired notice
 *          hiding itself once the tools are ready, for older agents, and when
 *          the gateway answers although the job never ran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CommandToolsStatus } from '@/lib/api/daemon-command-tools';
import type * as CommandToolsHooks from '@/lib/api/hooks/use-command-tools';

const hooks = vi.hoisted(() => ({
  data: null as CommandToolsStatus | null,
  gatewayRunning: false,
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));
vi.mock('@/lib/api/hooks/use-command-tools', async importOriginal => {
  const actual = await importOriginal<typeof CommandToolsHooks>();
  return {
    ...actual,
    useCommandTools: () => ({ data: hooks.data }),
    useCommandToolsPending: () => ({ status: hooks.data, pending: actual.commandToolsPending(hooks.data, hooks.gatewayRunning) }),
    useRetryCommandTools: () => ({ mutate: hooks.mutate, isPending: hooks.isPending, error: hooks.error }),
  };
});
vi.mock('@/lib/api/hooks/use-gateway-link', () => ({
  useGatewayLink: () => ({
    data: { url: 'http://127.0.0.1:19002', dashboardUrl: 'http://127.0.0.1:19002/', running: hooks.gatewayRunning },
  }),
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true }) }));
vi.mock('@/providers/I18nProvider', async () => {
  const { en } = await import('@/lib/i18n');
  return { useTranslation: () => ({ locale: 'en', setLocale: () => {}, t: (key: string) => en[key] ?? key }) };
});

import { CommandToolsNotice, CommandToolsNoticeView, pendingProgress } from '../CommandToolsNotice';

function status(overrides: Partial<CommandToolsStatus> = {}): CommandToolsStatus {
  return {
    state: 'running',
    phase: 'Downloading the command tools',
    detail: '213 package files ready',
    startedAt: '2026-09-17T12:00:00Z',
    updatedAt: '2026-09-17T12:01:42Z',
    finishedAt: null,
    error: null,
    logPath: 'C:\\Temp\\configure-agent.log',
    attempt: 1,
    cliPresent: false,
    gatewayRunning: false,
    taskName: 'StonkAgents command tools',
    supported: true,
    ...overrides,
  };
}

const SENTENCE =
  'Your agent is live. The command tools (OpenClaw) are still being set up, which can take up to 10 minutes after installation.';

beforeEach(() => {
  hooks.data = null;
  hooks.gatewayRunning = false;
  hooks.isPending = false;
  hooks.error = null;
  hooks.mutate.mockClear();
});

describe('CommandToolsNoticeView', () => {
  it('says the agent is live and the tools take up to 10 minutes, with the phase and detail', () => {
    render(<CommandToolsNoticeView status={status()} pending="running" onRetry={vi.fn()} retrying={false} />);
    const notice = screen.getByTestId('command-tools-notice');
    expect(notice).toHaveAttribute('data-state', 'running');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent(SENTENCE);
    expect(screen.getByTestId('command-tools-notice-progress')).toHaveTextContent(
      'Downloading the command tools, 213 package files ready',
    );
    expect(screen.queryByTestId('command-tools-notice-retry')).not.toBeInTheDocument();
    expect(pendingProgress(status({ phase: '', detail: '' }))).toBe('');
  });

  it('offers to start the job for a status that never started', () => {
    const onRetry = vi.fn();
    render(
      <CommandToolsNoticeView
        status={status({ state: 'not_started', phase: '', detail: '' })}
        pending="running"
        onRetry={onRetry}
        retrying={false}
      />,
    );
    expect(screen.getByTestId('command-tools-notice')).toHaveTextContent(SENTENCE);
    expect(screen.queryByTestId('command-tools-notice-progress')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('command-tools-notice-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('names the error and offers Retry when the job failed', () => {
    const onRetry = vi.fn();
    render(
      <CommandToolsNoticeView
        status={status({ state: 'failed', error: 'exit status 1: npm ERR! network' })}
        pending="failed"
        onRetry={onRetry}
        retrying={false}
        retryError="Nobody is logged on at this machine, so the setup cannot start. Log on and retry."
      />,
    );
    const notice = screen.getByTestId('command-tools-notice');
    expect(notice).toHaveAttribute('data-state', 'failed');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice).toHaveTextContent('The command tools did not finish setting up: exit status 1: npm ERR! network.');
    expect(notice).toHaveTextContent('configure-agent.log');
    expect(screen.getByTestId('command-tools-notice-retry-error')).toHaveTextContent('Nobody is logged on');
    const retry = screen.getByTestId('command-tools-notice-retry');
    expect(retry).toHaveTextContent('Retry');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables Retry while a retry is in flight', () => {
    render(<CommandToolsNoticeView status={status({ state: 'failed' })} pending="failed" onRetry={vi.fn()} retrying />);
    const retry = screen.getByTestId('command-tools-notice-retry');
    expect(retry).toBeDisabled();
    expect(retry).toHaveTextContent('Retrying');
  });
});

describe('CommandToolsNotice (wired)', () => {
  it('renders nothing when the tools are ready, for an agent without the job, or off Windows', () => {
    for (const value of [null, status({ state: 'ready', finishedAt: '2026-09-17T12:05:00Z' }), status({ supported: false })]) {
      hooks.data = value;
      const { unmount } = render(<CommandToolsNotice />);
      expect(screen.queryByTestId('command-tools-notice')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows the notice while the job runs and drops it once the poll says ready', () => {
    hooks.data = status();
    const { rerender } = render(<CommandToolsNotice />);
    expect(screen.getByTestId('command-tools-notice')).toHaveAttribute('data-state', 'running');
    hooks.data = status({ state: 'ready', finishedAt: '2026-09-17T12:05:00Z' });
    rerender(<CommandToolsNotice />);
    expect(screen.queryByTestId('command-tools-notice')).not.toBeInTheDocument();
  });

  it('lets a never-started job through when the gateway link says the gateway runs', () => {
    hooks.data = status({ state: 'not_started' });
    hooks.gatewayRunning = true;
    render(<CommandToolsNotice />);
    expect(screen.queryByTestId('command-tools-notice')).not.toBeInTheDocument();
  });

  it('wires Retry to the mutation and surfaces its error', () => {
    hooks.data = status({ state: 'failed', error: 'exit status 1' });
    hooks.error = new Error('The command tools are still being set up.');
    render(<CommandToolsNotice />);
    fireEvent.click(screen.getByTestId('command-tools-notice-retry'));
    expect(hooks.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('command-tools-notice-retry-error')).toHaveTextContent('still being set up');
  });
});
