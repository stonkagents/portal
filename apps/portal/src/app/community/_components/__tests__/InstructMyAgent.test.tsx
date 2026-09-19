/**
 * Purpose: The compose box lets the user pick what the post is filed as (General, Request,
 *          Token offer) so the board's Requests and Token Offers filters can be populated.
 *          The category rides along to the tracker, a bounty only turns a General post into
 *          a bounty post, and the agent drafts from an instruction that carries the intent.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mutate = vi.hoisted(() => vi.fn());
const agentChat = vi.hoisted(() => vi.fn());

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({ connected: true, health: { peerId: '12D3KooWtest', status: 'ok' } }),
}));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  AgentRequiredNotice: () => null,
  useAgentRequired: () => ({ connected: true, required: false, title: undefined }),
}));
vi.mock('@/components/layout/MobileDaemonGate', () => ({
  MobileDaemonGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/api/hooks/use-community', () => ({
  useCreatePost: () => ({ mutate, isPending: false, isSuccess: false }),
}));
vi.mock('@/lib/api/hooks/use-credits', () => ({
  useCredits: () => ({ data: { free_balance: 100, paid_balance: 500, total: 600, detailed_trial_remaining: 0 } }),
}));
vi.mock('@/lib/api/hooks/use-agent-identity', () => ({ useAgentIdentity: () => ({ data: undefined }) }));
vi.mock('@/lib/api/daemon', () => ({ daemonApi: { agentChat } }));
/* The owner launched one token; its mint has 6 decimals on chain. */
const owned = vi.hoisted(() => ({ tokens: [{ mint: 'Mint111', symbol: 'STONK', name: 'Stonk' }], isLoading: false }));
vi.mock('@/lib/api/hooks/use-owned-launch-tokens', () => ({
  useOwnedLaunchTokens: () => owned,
  useMintDecimals: (mint: string | null) => ({ data: mint ? { decimals: 6, program: 'p', isToken2022: true } : undefined, isError: false }),
}));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useDisplayNameSearch: () => ({ data: [] }) }));

import { InstructMyAgent, buildDraftInstruction, resolvePostCategory } from '../InstructMyAgent';

const INSTRUCTION = 'Looking for the Q3 earnings dataset';
const DRAFT = 'Anyone have the Q3 earnings dataset? Happy to trade.';

function typeInstruction(text = INSTRUCTION) {
  fireEvent.change(screen.getByTestId('compose-textarea'), { target: { value: text } });
}

async function draft() {
  fireEvent.click(screen.getByTestId('compose-draft'));
  await waitFor(() => expect(screen.getByTestId('draft-preview')).toBeInTheDocument());
}

/** Pick the launched token, whole tokens per reply, and how many replies can be paid. */
function fillTokenOffer(amount = '500', max = '10') {
  fireEvent.change(screen.getByTestId('token-offer-mint'), { target: { value: 'Mint111' } });
  fireEvent.change(screen.getByTestId('token-offer-amount'), { target: { value: amount } });
  fireEvent.change(screen.getByTestId('token-offer-max'), { target: { value: max } });
}

function attachBounty(amount: string) {
  fireEvent.click(screen.getByTestId('compose-bounty'));
  fireEvent.change(screen.getByTestId('bounty-amount-input'), { target: { value: amount } });
}

describe('InstructMyAgent post category', () => {
  beforeEach(() => {
    mutate.mockReset();
    agentChat.mockReset().mockResolvedValue({ response: DRAFT });
  });

  it('offers General, Request and Token offer with General selected by default', () => {
    render(<InstructMyAgent />);
    expect(screen.getByTestId('compose-category-general')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('compose-category-request')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('compose-category-token-offer')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('compose-category-request')).toHaveAttribute('title', 'ask the network for data, a file or help');
    expect(screen.getByTestId('compose-category-token-offer')).toHaveAttribute('title', 'offer or promote a token');
  });

  it('posts as general by default with the plain instruction as the draft prompt', async () => {
    render(<InstructMyAgent />);
    typeInstruction();
    await draft();
    expect(agentChat).toHaveBeenCalledWith(expect.objectContaining({ messages: [{ role: 'user', content: INSTRUCTION }] }));
    expect(screen.getByTestId('preview-category')).toHaveTextContent('General');

    fireEvent.click(screen.getByTestId('preview-approve'));
    expect(mutate).toHaveBeenCalledWith({ body: DRAFT, tags: [], category: 'general' });
  });

  it('selecting Request sends category request and drafts with the request intent', async () => {
    render(<InstructMyAgent />);
    fireEvent.click(screen.getByTestId('compose-category-request'));
    expect(screen.getByTestId('compose-category-request')).toHaveAttribute('aria-checked', 'true');
    typeInstruction();
    await draft();
    expect(agentChat).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: `Write a request post: ${INSTRUCTION}` }] }),
    );
    expect(screen.getByTestId('preview-category')).toHaveTextContent('Request');

    fireEvent.click(screen.getByTestId('preview-approve'));
    expect(mutate).toHaveBeenCalledWith({ body: DRAFT, tags: [], category: 'request' });
  });

  it('selecting Token offer needs a launched token, an amount and a count, then sends the raw offer', async () => {
    render(<InstructMyAgent />);
    fireEvent.click(screen.getByTestId('compose-category-token-offer'));
    typeInstruction('Offering 500 $AGENT for a clean sentiment feed');
    expect(screen.getByTestId('compose-draft')).toBeDisabled();
    fillTokenOffer('500', '10');
    expect(screen.getByTestId('token-offer-summary')).toHaveTextContent('Up to 5,000 STONK in total');
    expect(screen.getByTestId('compose-draft')).toBeEnabled();
    await draft();
    expect(agentChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Write a token offer post: Offering 500 $AGENT for a clean sentiment feed' }],
      }),
    );
    expect(screen.getByTestId('preview-category')).toHaveTextContent('Token offer');

    fireEvent.click(screen.getByTestId('preview-approve'));
    expect(mutate).toHaveBeenCalledWith({
      body: DRAFT,
      tags: [],
      category: 'token-offer',
      tokenOffer: { mint: 'Mint111', amount_per_reply: 500_000_000, max_accepts: 10 },
    });
  });

  it('says so when the owner has no launched token to offer', () => {
    owned.tokens = [];
    render(<InstructMyAgent />);
    fireEvent.click(screen.getByTestId('compose-category-token-offer'));
    expect(screen.getByTestId('token-offer-none')).toHaveTextContent('Launch a token here first');
    owned.tokens = [{ mint: 'Mint111', symbol: 'STONK', name: 'Stonk' }];
  });

  it('Request with a bounty stays a request and carries the bounty fields', async () => {
    render(<InstructMyAgent />);
    fireEvent.click(screen.getByTestId('compose-category-request'));
    typeInstruction();
    attachBounty('50');
    await draft();
    fireEvent.click(screen.getByTestId('preview-approve'));
    expect(mutate).toHaveBeenCalledWith({
      body: DRAFT,
      tags: [],
      category: 'request',
      bounty: { amount: 50, currency: 'credits', days: 7 },
    });
  });

  it('General with a bounty becomes a bounty post', async () => {
    render(<InstructMyAgent />);
    typeInstruction();
    attachBounty('25');
    await draft();
    fireEvent.click(screen.getByTestId('preview-approve'));
    expect(mutate).toHaveBeenCalledWith({
      body: DRAFT,
      tags: [],
      category: 'bounty',
      bounty: { amount: 25, currency: 'credits', days: 7 },
    });
  });

  it('keeps the chosen category through the edit stage and on approve from there', async () => {
    render(<InstructMyAgent />);
    fireEvent.click(screen.getByTestId('compose-category-token-offer'));
    typeInstruction();
    fillTokenOffer('1.5', '2');
    await draft();
    fireEvent.click(screen.getByTestId('preview-edit'));
    expect(screen.getByTestId('edit-category')).toHaveTextContent('Token offer');
    fireEvent.change(screen.getByTestId('edit-textarea'), { target: { value: 'Edited token offer body' } });
    fireEvent.click(screen.getByTestId('edit-approve'));
    expect(mutate).toHaveBeenCalledWith({
      body: 'Edited token offer body',
      tags: [],
      category: 'token-offer',
      tokenOffer: { mint: 'Mint111', amount_per_reply: 1_500_000, max_accepts: 2 },
    });
  });
});

describe('compose category helpers', () => {
  it('prefixes the draft instruction with the intent for request and token offer only', () => {
    expect(buildDraftInstruction('general', '  hello board  ')).toBe('hello board');
    expect(buildDraftInstruction('request', 'need the file')).toBe('Write a request post: need the file');
    expect(buildDraftInstruction('token-offer', 'selling 10 $X')).toBe('Write a token offer post: selling 10 $X');
  });

  it('a bounty only turns a general post into a bounty post', () => {
    expect(resolvePostCategory('general', false)).toBe('general');
    expect(resolvePostCategory('general', true)).toBe('bounty');
    expect(resolvePostCategory('request', true)).toBe('request');
    expect(resolvePostCategory('token-offer', true)).toBe('token-offer');
  });
});
