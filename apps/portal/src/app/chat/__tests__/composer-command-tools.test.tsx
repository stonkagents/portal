/**
 * Purpose: The chat composer waits for the OpenClaw command tools (installed in
 *          the background after the agent is live, 2.6.0+): the input and Send
 *          give way to the "up to 10 minutes" notice while the job runs, the
 *          failed notice carries Retry, and the composer is back once the job
 *          is ready or the agent has no such job.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as CommandToolsHooks from '@/lib/api/hooks/use-command-tools';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: true,
    refresh: vi.fn().mockResolvedValue(undefined),
    health: { peerId: '12D3KooWtest', status: 'ok' },
  }),
}));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
/* Enough paid credits that Detailed is selectable. */
vi.mock('@/lib/api/hooks/use-credits', () => ({
  useCredits: () => ({ data: { free_balance: 100, paid_balance: 500, total: 600, detailed_trial_remaining: 0 } }),
}));
vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  CONTROLLER_URL: 'http://127.0.0.1:7860',
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
  daemonApi: {
    agentChatSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    agentChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  },
}));
vi.mock('../_components/use-agent-chat', () => ({
  useAgentChat: () => ({
    messages: [],
    sessionId: null,
    streaming: false,
    streamText: '',
    queue: [],
    error: null,
    errorMessage: null,
    historyLoading: false,
    send: vi.fn(),
    abort: vi.fn(),
    newSession: vi.fn(),
    loadHistory: vi.fn().mockResolvedValue(true),
    loadSavedSession: vi.fn().mockResolvedValue(undefined),
    removeFromQueue: vi.fn(),
    clearError: vi.fn(),
  }),
}));
vi.mock('../_components/chat-thread', () => ({ ChatThread: () => <div data-testid="chat-thread" /> }));
vi.mock('../_components/OpenGatewayLink', () => ({ OpenGatewayLink: () => null }));

const tools = vi.hoisted(() => ({
  data: null as null | Record<string, unknown>,
  mutate: vi.fn(),
}));
vi.mock('@/lib/api/hooks/use-command-tools', async importOriginal => {
  const actual = await importOriginal<typeof CommandToolsHooks>();
  return {
    ...actual,
    useCommandTools: () => ({ data: tools.data }),
    useCommandToolsPending: () => ({
      status: tools.data,
      pending: actual.commandToolsPending(tools.data as Parameters<typeof actual.commandToolsPending>[0]),
    }),
    useRetryCommandTools: () => ({ mutate: tools.mutate, isPending: false, error: null }),
  };
});
vi.mock('@/lib/api/hooks/use-gateway-link', () => ({ useGatewayLink: () => ({ data: null }) }));
vi.mock('@/providers/I18nProvider', async () => {
  const { en } = await import('@/lib/i18n');
  return { useTranslation: () => ({ locale: 'en', setLocale: () => {}, t: (key: string) => en[key] ?? key }) };
});
vi.mock('../_components/ChatDaemonSetupPanel', () => ({ ChatDaemonSetupPanel: () => null }));

import ChatPage from '../page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChatPage />
    </QueryClientProvider>,
  );
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    state: 'running',
    phase: 'Downloading the command tools',
    detail: '213 package files ready',
    startedAt: '2026-09-17T12:00:00Z',
    updatedAt: null,
    finishedAt: null,
    error: null,
    logPath: null,
    attempt: 1,
    cliPresent: false,
    gatewayRunning: false,
    taskName: 'StonkAgents command tools',
    supported: true,
    ...overrides,
  };
}

beforeEach(() => {
  tools.data = null;
  tools.mutate.mockClear();
});

describe('Chat composer while the command tools install', () => {
  it('shows the composer when the agent has no command tools job (older agent, macOS)', async () => {
    renderPage();
    expect(await screen.findByTestId('agent-chat-input')).toBeInTheDocument();
    expect(screen.queryByTestId('command-tools-notice')).not.toBeInTheDocument();
  });

  it('replaces the input and Send with the notice while the job runs, and brings them back once ready', async () => {
    tools.data = status();
    const { rerender } = renderPage();
    const notice = await screen.findByTestId('command-tools-notice');
    expect(notice).toHaveAttribute('data-state', 'running');
    expect(notice).toHaveTextContent('can take up to 10 minutes after installation');
    expect(notice).toHaveTextContent('Downloading the command tools, 213 package files ready');
    expect(screen.queryByTestId('agent-chat-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-chat-send')).not.toBeInTheDocument();
    /* The model toggle stays; only the composer waits. */
    expect(screen.getByTestId('model-toggle')).toBeInTheDocument();

    tools.data = status({ state: 'ready', finishedAt: '2026-09-17T12:05:00Z' });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ChatPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('agent-chat-input')).toBeInTheDocument();
    expect(screen.queryByTestId('command-tools-notice')).not.toBeInTheDocument();
  });

  it('names the error with Retry when the job failed', async () => {
    tools.data = status({ state: 'failed', error: 'exit status 1: npm ERR! network' });
    renderPage();
    const notice = await screen.findByTestId('command-tools-notice');
    expect(notice).toHaveAttribute('data-state', 'failed');
    expect(notice).toHaveTextContent('The command tools did not finish setting up: exit status 1: npm ERR! network.');
    fireEvent.click(screen.getByTestId('command-tools-notice-retry'));
    expect(tools.mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('agent-chat-input')).not.toBeInTheDocument();
  });
});
