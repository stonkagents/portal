/**
 * Purpose: Chat status bar names the selected model (CHAT_MODELS label) instead of a version
 *          string, and no longer carries the inert "Show thinking" checkbox.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
vi.mock('../_components/ChatDaemonSetupPanel', () => ({ ChatDaemonSetupPanel: () => null }));

import ChatPage from '../page';
import { CHAT_MODELS } from '@/lib/api/models';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChatPage />
    </QueryClientProvider>,
  );
}

describe('Chat status bar', () => {
  it('names the selected model and follows the model toggle', async () => {
    renderPage();
    const label = screen.getByTestId('ac-model-text');
    expect(label).toHaveTextContent(`${CHAT_MODELS['gpt-5.4-mini'].label} model`);
    expect(label).not.toHaveTextContent(/v1\.0/);

    /* The composer (and its model toggle) mounts once the saved session has been restored. */
    fireEvent.click(await screen.findByTestId('model-toggle-gpt-5.4'));
    expect(screen.getByTestId('ac-model-text')).toHaveTextContent(`${CHAT_MODELS['gpt-5.4'].label} model`);
  });

  it('has no "Show thinking" checkbox', () => {
    renderPage();
    expect(screen.queryByTestId('ac-thinking-toggle')).not.toBeInTheDocument();
    expect(screen.queryByText(/show thinking/i)).not.toBeInTheDocument();
  });
});
