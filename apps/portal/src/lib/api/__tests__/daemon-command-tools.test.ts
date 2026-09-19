/**
 * Purpose: Tests for the command tools job client: the status parse (snake to
 *          camel, unknown shapes rejected), the proxy-then-direct read, the
 *          404 of an older agent, and the retry's headers and error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  COMMAND_TOOLS_DIRECT_URL,
  COMMAND_TOOLS_PROXY_URL,
  COMMAND_TOOLS_RETRY_URL,
  getCommandToolsStatus,
  parseCommandToolsStatus,
  retryCommandTools,
} from '../daemon-command-tools';
import { SETUP_HEADER } from '../daemon-setup';

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const RUNNING = {
  state: 'running',
  phase: 'Downloading the command tools',
  detail: '213 package files ready',
  started_at: '2026-09-17T12:00:00Z',
  updated_at: '2026-09-17T12:01:42Z',
  log_path: 'C:\\Temp\\configure-agent.log',
  attempt: 1,
  pid: 4242,
  cli_present: false,
  gateway_running: false,
  task_name: 'StonkAgents command tools',
  supported: true,
};

describe('parseCommandToolsStatus', () => {
  it('maps the controller answer to camelCase', () => {
    expect(parseCommandToolsStatus(RUNNING)).toEqual({
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
    });
  });

  it('keeps a failed job\'s error and a ready job\'s finish time', () => {
    const failed = parseCommandToolsStatus({ state: 'failed', error: 'exited 1: npm install failed', finished_at: '2026-09-17T12:05:00Z', attempt: 2 });
    expect(failed?.error).toBe('exited 1: npm install failed');
    expect(failed?.finishedAt).toBe('2026-09-17T12:05:00Z');
    expect(failed?.attempt).toBe(2);
    expect(failed?.supported).toBe(true);
    expect(parseCommandToolsStatus({ state: 'not_started', supported: false })?.supported).toBe(false);
  });

  it('rejects anything that is not a status', () => {
    expect(parseCommandToolsStatus(null)).toBeNull();
    expect(parseCommandToolsStatus({ error: { code: 'NOT_FOUND' } })).toBeNull();
    expect(parseCommandToolsStatus({ state: 'weird' })).toBeNull();
  });
});

describe('getCommandToolsStatus', () => {
  it('reads through the daemon proxy first', async () => {
    fetchMock.mockResolvedValueOnce(json(RUNNING));
    const status = await getCommandToolsStatus();
    expect(status?.state).toBe('running');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(COMMAND_TOOLS_PROXY_URL);
  });

  it('falls back to the controller when the daemon is down', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(json({ ...RUNNING, state: 'ready' }));
    const status = await getCommandToolsStatus();
    expect(status?.state).toBe('ready');
    expect(fetchMock.mock.calls[1][0]).toBe(COMMAND_TOOLS_DIRECT_URL);
  });

  it('is null for an agent that predates the job (404) and for an unreachable one', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NOT_FOUND' } }, 404));
    expect(await getCommandToolsStatus()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getCommandToolsStatus()).toBeNull();
  });
});

describe('retryCommandTools', () => {
  it('POSTs through the daemon proxy with the setup headers', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 'started', task_name: 'StonkAgents command tools', attempt: 2 }, 202));
    expect(await retryCommandTools()).toEqual({ kind: 'ok', attempt: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(COMMAND_TOOLS_RETRY_URL);
    expect(init.method).toBe('POST');
    expect(init.headers[SETUP_HEADER]).toBe('1');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('relays the controller\'s refusal, with our words when it sends only a code', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'ALREADY_RUNNING', message: 'the command tools setup is still running: Downloading' } }, 409));
    expect(await retryCommandTools()).toEqual({ kind: 'error', code: 'ALREADY_RUNNING', message: 'the command tools setup is still running: Downloading' });
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NO_USER' } }, 500));
    const noUser = await retryCommandTools();
    expect(noUser.kind === 'error' && noUser.message).toMatch(/Nobody is logged on/);
    fetchMock.mockRejectedValueOnce(new Error('down'));
    const down = await retryCommandTools();
    expect(down.kind === 'error' && down.message).toMatch(/did not answer/);
  });
});
