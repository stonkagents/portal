/**
 * Purpose: Tests for the Command tools chip: the running text with the npm
 *          counter and elapsed time, the ready notice, the failed notice with
 *          Retry, and the wired chip hiding itself when there is nothing to say.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CommandToolsStatus } from '@/lib/api/daemon-command-tools';
import type * as CommandToolsHooks from '@/lib/api/hooks/use-command-tools';

const hooks = vi.hoisted(() => ({
  data: null as CommandToolsStatus | null,
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));
vi.mock('@/lib/api/hooks/use-command-tools', async importOriginal => {
  const actual = await importOriginal<typeof CommandToolsHooks>();
  return {
    ...actual,
    useCommandTools: () => ({ data: hooks.data }),
    useRetryCommandTools: () => ({ mutate: hooks.mutate, isPending: hooks.isPending, error: hooks.error }),
  };
});

import { CommandToolsChip, CommandToolsChipView, elapsedBetween, shortError } from '../CommandToolsChip';

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

const NOW = Date.parse('2026-09-17T12:01:42Z');

beforeEach(() => {
  hooks.data = null;
  hooks.isPending = false;
  hooks.error = null;
  hooks.mutate.mockReset();
});

describe('CommandToolsChipView', () => {
  it('running: phase in the tooltip, the npm counter and the elapsed time in the text', () => {
    render(<CommandToolsChipView status={status()} now={NOW} onRetry={vi.fn()} retrying={false} />);
    const chip = screen.getByTestId('command-tools-chip');
    expect(chip).toHaveAttribute('data-state', 'running');
    expect(chip).toHaveTextContent('Command tools: setting up (213 package files ready, 1:42)');
    expect(chip).toHaveAttribute('title', 'Downloading the command tools. Log: C:\\Temp\\configure-agent.log');
    expect(screen.queryByTestId('command-tools-retry')).toBeNull();
  });

  it('running without a counter shows only the elapsed time', () => {
    render(<CommandToolsChipView status={status({ detail: '', phase: 'Waiting for the StonkAgents service' })} now={NOW} onRetry={vi.fn()} retrying={false} />);
    expect(screen.getByTestId('command-tools-chip')).toHaveTextContent('Command tools: setting up (1:42)');
  });

  it('ready: a green notice', () => {
    render(<CommandToolsChipView status={status({ state: 'ready', finishedAt: '2026-09-17T12:04:00Z' })} now={NOW} onRetry={vi.fn()} retrying={false} />);
    const chip = screen.getByTestId('command-tools-chip');
    expect(chip).toHaveAttribute('data-state', 'ready');
    expect(chip).toHaveTextContent('Command tools ready');
  });

  it('failed: the short error and a Retry button that calls back', () => {
    const onRetry = vi.fn();
    render(
      <CommandToolsChipView
        status={status({ state: 'failed', error: 'exited 1: Global install of stonkagents failed (exit 1, non-fatal).', finishedAt: '2026-09-17T12:05:00Z' })}
        now={NOW}
        onRetry={onRetry}
        retrying={false}
      />,
    );
    const chip = screen.getByTestId('command-tools-chip');
    expect(chip).toHaveAttribute('data-state', 'failed');
    expect(chip).toHaveTextContent('Command tools failed: exited 1: Global install of stonkagents failed (exit 1, non-fatal).');
    fireEvent.click(screen.getByTestId('command-tools-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('failed: Retry is disabled while a retry is in flight and shows the refusal', () => {
    render(<CommandToolsChipView status={status({ state: 'failed', error: null })} now={NOW} onRetry={vi.fn()} retrying retryError="Nobody is logged on" />);
    const button = screen.getByTestId('command-tools-retry');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Retrying');
    expect(button).toHaveAttribute('title', 'Nobody is logged on');
    expect(screen.getByTestId('command-tools-chip')).toHaveTextContent('Command tools failed: see the log file');
  });
});

describe('CommandToolsChip', () => {
  it('renders nothing without a job, for an old ready job, or off Windows', () => {
    hooks.data = null;
    const { rerender } = render(<CommandToolsChip />);
    expect(screen.queryByTestId('command-tools-chip')).toBeNull();
    hooks.data = status({ state: 'ready', finishedAt: '2020-01-01T00:00:00Z' });
    rerender(<CommandToolsChip />);
    expect(screen.queryByTestId('command-tools-chip')).toBeNull();
    hooks.data = status({ supported: false });
    rerender(<CommandToolsChip />);
    expect(screen.queryByTestId('command-tools-chip')).toBeNull();
  });

  it('shows a running job and wires Retry to the mutation', () => {
    hooks.data = status({ state: 'failed', error: 'exited 1' });
    render(<CommandToolsChip />);
    fireEvent.click(screen.getByTestId('command-tools-retry'));
    expect(hooks.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('helpers', () => {
  it('elapsedBetween formats m:ss and h:mm:ss', () => {
    expect(elapsedBetween('2026-09-17T12:00:00Z', Date.parse('2026-09-17T12:01:42Z'))).toBe('1:42');
    expect(elapsedBetween('2026-09-17T12:00:00Z', '2026-09-17T13:02:03Z')).toBe('1:02:03');
    expect(elapsedBetween(null, NOW)).toBe('');
    expect(elapsedBetween('nope', NOW)).toBe('');
  });
  it('shortError caps the text at a word boundary', () => {
    expect(shortError('  ')).toBe('see the log file');
    const long = 'word '.repeat(40).trim();
    const short = shortError(long);
    expect(short.length).toBeLessThanOrEqual(123);
    expect(short.endsWith('...')).toBe(true);
  });
});
