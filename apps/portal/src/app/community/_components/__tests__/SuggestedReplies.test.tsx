/**
 * Purpose: The suggested-replies inbox lists the agent's drafts with post, author,
 *          category, bounty and cost; Approve posts through the daemon, toasts
 *          "Reply posted" and invalidates the thread; Dismiss drops the draft; the
 *          panel collapses; and nothing renders offline or with an empty inbox.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as AutopilotModule from '@/lib/api/daemon-autopilot';
import { queryKeys } from '@/lib/api/keys';

const mockDaemon = vi.hoisted(() => ({ connected: true, health: { peerId: 'peer-1' } }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const client = vi.hoisted(() => ({
  getAutopilotSuggestions: vi.fn(),
  approveAutopilotSuggestion: vi.fn(),
  dismissAutopilotSuggestion: vi.fn(),
}));
vi.mock('@/lib/api/daemon-autopilot', async importOriginal => {
  const actual = await importOriginal<typeof AutopilotModule>();
  return { ...actual, ...client };
});

import { SuggestedReplies, REPLY_POSTED_TOAST, SUGGESTION_DISMISSED_TOAST } from '../SuggestedReplies';

const LONG_DRAFT = 'We hold the full Q3 dataset and can share it today. '.repeat(6).trim();

const SUGGESTIONS = [
  {
    id: 's1',
    postId: 'p1',
    postTitle: 'Need Q3 data',
    postAuthorName: 'Alice',
    category: 'request' as const,
    bounty: { amount: 40, currency: 'credits' },
    draft: LONG_DRAFT,
    estimatedCredits: 4,
    createdAt: '2026-09-15T09:00:00Z',
    expiresAt: '2026-09-16T09:00:00Z',
    relevance: 0.62,
    relevanceSignals: { library: 0.8, history: 0, instruction: 1, routed: 1 },
  },
  {
    id: 's2',
    postId: 'p2',
    postTitle: 'Anyone benchmarked llama?',
    postAuthorName: 'Bob',
    category: 'general' as const,
    draft: 'Yes, numbers attached.',
    estimatedCredits: 2,
    createdAt: '2026-09-15T09:30:00Z',
    expiresAt: '2026-09-16T09:30:00Z',
  },
];

let qc: QueryClient;

function renderPanel(onOpenPost?: (id: string) => void) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<SuggestedReplies onOpenPost={onOpenPost} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  client.getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: SUGGESTIONS });
});

describe('SuggestedReplies', () => {
  it('lists the drafts with post, author, category, bounty and cost, and opens the thread', async () => {
    const onOpenPost = vi.fn();
    renderPanel(onOpenPost);
    await waitFor(() => expect(screen.getByTestId('suggested-replies')).toBeInTheDocument());
    expect(screen.getByTestId('suggested-replies-toggle')).toHaveTextContent('Suggested replies (2)');
    const row = screen.getByTestId('suggestion-s1');
    expect(row).toHaveTextContent('Need Q3 data');
    expect(row).toHaveTextContent('by Alice');
    expect(row).toHaveTextContent('Request');
    expect(screen.getByTestId('suggestion-s1-bounty')).toHaveTextContent('Bounty 40 credits');
    expect(screen.getByTestId('suggestion-s1-credits')).toHaveTextContent('About 4 credits to post');
    expect(screen.queryByTestId('suggestion-s2-bounty')).toBeNull();
    /* Phase 3: the relevance value, with the four signals in the tooltip; none without a score */
    const relevance = screen.getByTestId('suggestion-s1-relevance');
    expect(relevance).toHaveTextContent('0.62');
    expect(relevance).toHaveAttribute('title', expect.stringContaining('Library 0.80, History 0.00, Instruction 1.00, Routed 1.00'));
    expect(screen.queryByTestId('suggestion-s2-relevance')).toBeNull();
    fireEvent.click(screen.getByTestId('suggestion-s1-post'));
    expect(onOpenPost).toHaveBeenCalledWith('p1');
  });

  it('collapses a long draft until expanded, and the whole panel on the header', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('suggestion-s1-draft')).toBeInTheDocument());
    expect(screen.getByTestId('suggestion-s1-draft').textContent!.length).toBeLessThan(LONG_DRAFT.length);
    fireEvent.click(screen.getByTestId('suggestion-s1-expand'));
    expect(screen.getByTestId('suggestion-s1-draft')).toHaveTextContent(LONG_DRAFT);
    expect(screen.queryByTestId('suggestion-s2-expand')).toBeNull();
    fireEvent.click(screen.getByTestId('suggested-replies-toggle'));
    expect(screen.queryByTestId('suggested-replies-list')).toBeNull();
    expect(screen.getByTestId('suggested-replies-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('approves through the daemon, toasts "Reply posted", drops the row and invalidates the thread', async () => {
    /* The daemon drops the draft as it posts it; the re-read after approve sees one left. */
    client.approveAutopilotSuggestion.mockImplementationOnce(async () => {
      client.getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: [SUGGESTIONS[1]] });
      return { kind: 'ok', value: { replyId: 'r1' } };
    });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('suggestion-s1-approve')).toBeInTheDocument());
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    fireEvent.click(screen.getByTestId('suggestion-s1-approve'));
    await waitFor(() => expect(client.approveAutopilotSuggestion).toHaveBeenCalledWith('s1'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: REPLY_POSTED_TOAST, variant: 'success' })),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.board.post('p1') });
    await waitFor(() => expect(screen.queryByTestId('suggestion-s1')).toBeNull());
    expect(screen.getByTestId('suggested-replies-toggle')).toHaveTextContent('Suggested replies (1)');
    expect(client.dismissAutopilotSuggestion).not.toHaveBeenCalled();
  });

  it('toasts the daemon refusal on approve and keeps the row', async () => {
    client.approveAutopilotSuggestion.mockResolvedValueOnce({
      kind: 'error',
      message: 'Not enough credits',
      code: 'INSUFFICIENT_CREDITS',
    });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('suggestion-s2-approve')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('suggestion-s2-approve'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', description: 'Not enough credits' })),
    );
    expect(screen.getByTestId('suggestion-s2')).toBeInTheDocument();
  });

  it('dismisses through the daemon and drops the row without posting', async () => {
    client.dismissAutopilotSuggestion.mockImplementationOnce(async () => {
      client.getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: [SUGGESTIONS[0]] });
      return { kind: 'ok', value: true };
    });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('suggestion-s2-dismiss')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('suggestion-s2-dismiss'));
    await waitFor(() => expect(client.dismissAutopilotSuggestion).toHaveBeenCalledWith('s2'));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: SUGGESTION_DISMISSED_TOAST })));
    await waitFor(() => expect(screen.queryByTestId('suggestion-s2')).toBeNull());
    expect(client.approveAutopilotSuggestion).not.toHaveBeenCalled();
  });

  it('renders nothing with an empty inbox, on an agent without autopilot, or offline', async () => {
    client.getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: [] });
    const empty = renderPanel();
    await waitFor(() => expect(client.getAutopilotSuggestions).toHaveBeenCalled());
    expect(screen.queryByTestId('suggested-replies')).toBeNull();
    empty.unmount();

    client.getAutopilotSuggestions.mockResolvedValue({ kind: 'unsupported' });
    const old = renderPanel();
    await waitFor(() => expect(client.getAutopilotSuggestions).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('suggested-replies')).toBeNull();
    old.unmount();

    client.getAutopilotSuggestions.mockClear();
    mockDaemon.connected = false;
    renderPanel();
    expect(screen.queryByTestId('suggested-replies')).toBeNull();
    expect(client.getAutopilotSuggestions).not.toHaveBeenCalled();
  });
});
