/**
 * Purpose: Paying a token offer runs wallet -> chain -> tracker in order: the
 *          transfer is built for the reply author's wallet, signed and sent
 *          through the wallet, waited on to finality, then its signature is
 *          POSTed to /board/posts/{id}/token-offer/pay. A wallet that is not
 *          the linked one stops before signing; the tracker's refusals and a
 *          wallet rejection become sentences.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { WalletService } from '@/lib/wallet/types';
import type { Post, ThreadReply } from '@/lib/types/community';
import { ApiRequestError } from '@/lib/api/errors';

const mockAddToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ toasts: [], addToast: mockAddToast, dismissToast: vi.fn() }) }));

const chain = vi.hoisted(() => ({
  build: vi.fn(async () => ({ tx: true })),
  wait: vi.fn(async () => {}),
  daemonFetch: vi.fn(),
  submit: vi.fn(async () => 'SIG123'),
  connection: { sendRawTransaction: vi.fn() },
}));
vi.mock('@/lib/board/token-offer-pay', () => ({ buildTokenOfferTransferTx: chain.build, waitForFinalized: chain.wait }));
vi.mock('@/lib/api/daemon-fetch', () => ({ daemonFetch: chain.daemonFetch }));
vi.mock('@/lib/wallet/submit', () => ({ submitViaWallet: chain.submit }));
vi.mock('@/lib/solana/connection', () => ({ getSolanaConnection: async () => chain.connection }));

import { payErrorMessage, payerWalletReason, usePayTokenOffer } from '../use-pay-token-offer';
import { readPendingPayments, savePendingPayment } from '@/lib/board/pending-payments';

const FROM = 'FWxdnjw6oYjRWHxBrmQ9eAQoWmn1z1fYNxU7mNjRZtho';

function wallet(overrides: Partial<WalletService> = {}): WalletService {
  return {
    installed: true,
    connected: true,
    publicKey: FROM,
    shortAddress: 'FWxd...Ztho',
    balance: 1,
    connecting: false,
    error: null,
    connect: vi.fn(async () => true),
    disconnect: vi.fn(async () => {}),
    fetchBalance: vi.fn(async () => {}),
    sign: vi.fn(),
    signAndSend: vi.fn(),
    ...overrides,
  };
}

const post = {
  id: 'p1',
  tokenOffer: { mint: 'Mint111', symbol: 'STONK', decimals: 6, amount: 1_500_000, max: 10, paid: 3 },
} as Post;
const reply = { id: 'r1', authorWallet: 'WalletB' } as ThreadReply;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  chain.daemonFetch.mockResolvedValue({ id: 'p1', author: 'me', authorTier: 'new', content: 'c', time: 't', tags: [], category: 'token-offer', upvotes: 0, replies: 1, viewCount: 0, tokenOffer: { mint: 'Mint111', symbol: 'STONK', decimals: 6, amount: 1_500_000, max: 10, paid: 4 } });
});

describe('usePayTokenOffer', () => {
  it('builds the transfer to the replier, submits via the wallet, waits, then posts the signature', async () => {
    const w = wallet();
    const { result } = renderHook(() => usePayTokenOffer(w, FROM, 'p1'), { wrapper: wrapper() });
    await act(() => result.current.pay({ post, reply }));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(chain.build).toHaveBeenCalledWith(chain.connection, {
      postId: 'p1',
      replyId: 'r1',
      mint: 'Mint111',
      amountRaw: 1_500_000,
      from: FROM,
      to: 'WalletB',
    });
    expect(chain.submit).toHaveBeenCalledWith(w, { tx: true }, expect.any(Function));
    expect(chain.wait).toHaveBeenCalledWith(chain.connection, 'SIG123');
    expect(chain.daemonFetch).toHaveBeenCalledWith('/board/posts/p1/token-offer/pay', {
      method: 'POST',
      body: JSON.stringify({ reply_id: 'r1', signature: 'SIG123' }),
    });
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Offer paid' }));
    expect(readPendingPayments('p1')).toEqual({});
    expect(result.current.pending).toEqual({});
  });

  it('never signs without a linked wallet, and never twice for the same reply', async () => {
    const none = renderHook(() => usePayTokenOffer(wallet(), null, 'p1'), { wrapper: wrapper() });
    await act(() => none.result.current.pay({ post, reply }));
    expect(none.result.current.error).toBe('Link a wallet in Settings before paying.');
    expect(chain.build).not.toHaveBeenCalled();

    const unknown = renderHook(() => usePayTokenOffer(wallet(), undefined, 'p1'), { wrapper: wrapper() });
    await act(() => unknown.result.current.pay({ post, reply }));
    expect(unknown.result.current.error).toContain('Checking your linked wallet');
    expect(chain.build).not.toHaveBeenCalled();

    savePendingPayment('p1', 'r1', 'SIGOLD');
    const again = renderHook(() => usePayTokenOffer(wallet(), FROM, 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(again.result.current.pending.r1?.signature).toBe('SIGOLD'));
    await act(() => again.result.current.pay({ post, reply }));
    expect(again.result.current.error).toContain('already sent');
    expect(chain.build).not.toHaveBeenCalled();
  });

  it('keeps the signature when the record call fails after the transfer landed, and records it later without a transfer', async () => {
    chain.daemonFetch.mockRejectedValueOnce(new Error('proxy timeout'));
    const w = wallet();
    const { result } = renderHook(() => usePayTokenOffer(w, FROM, 'p1'), { wrapper: wrapper() });
    await act(() => result.current.pay({ post, reply }));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('The transfer is on chain');
    expect(result.current.error).not.toContain('try again');
    expect(readPendingPayments('p1').r1.signature).toBe('SIG123');
    expect(result.current.pending.r1.signature).toBe('SIG123');

    chain.build.mockClear();
    chain.submit.mockClear();
    await act(() => result.current.record({ post, reply, signature: 'SIG123' }));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(chain.build).not.toHaveBeenCalled();
    expect(chain.submit).not.toHaveBeenCalled();
    expect(chain.daemonFetch).toHaveBeenLastCalledWith('/board/posts/p1/token-offer/pay', {
      method: 'POST',
      body: JSON.stringify({ reply_id: 'r1', signature: 'SIG123' }),
    });
    expect(readPendingPayments('p1')).toEqual({});
  });

  it('drops the stored signature on ALREADY_PAID and on a final TX_INVALID reason, keeps it otherwise', async () => {
    savePendingPayment('p1', 'r1', 'SIGA');
    chain.daemonFetch.mockRejectedValueOnce(new ApiRequestError(409, { code: 'TOKEN_OFFER_ALREADY_PAID', message: 'x' }));
    const { result } = renderHook(() => usePayTokenOffer(wallet(), FROM, 'p1'), { wrapper: wrapper() });
    await act(() => result.current.record({ post, reply, signature: 'SIGA' }));
    expect(readPendingPayments('p1')).toEqual({});

    savePendingPayment('p1', 'r1', 'SIGB');
    chain.daemonFetch.mockRejectedValueOnce(new ApiRequestError(422, { code: 'TOKEN_OFFER_TX_INVALID', message: 'Transaction does not pay this reply its offer: expected 1500000 to WalletB' }));
    await act(() => result.current.record({ post, reply, signature: 'SIGB' }));
    expect(readPendingPayments('p1')).toEqual({});
    expect(result.current.error).toBe('Transaction does not pay this reply its offer: expected 1500000 to WalletB');

    savePendingPayment('p1', 'r1', 'SIGC');
    chain.daemonFetch.mockRejectedValueOnce(new ApiRequestError(422, { code: 'TOKEN_OFFER_TX_INVALID', message: 'transaction not found yet' }));
    await act(() => result.current.record({ post, reply, signature: 'SIGC' }));
    expect(readPendingPayments('p1').r1.signature).toBe('SIGC');
    expect(result.current.error).toContain('Record payment');
  });

  it('stops before the wallet when the connected wallet is not the linked one', async () => {
    const w = wallet();
    const { result } = renderHook(() => usePayTokenOffer(w, 'LinkedWallet1111111111111111111111111111111', 'p1'), { wrapper: wrapper() });
    await act(() => result.current.pay({ post, reply }));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('Connect the wallet linked to this agent: Linked...11111');
    expect(chain.build).not.toHaveBeenCalled();
  });

  it('refuses a reply without a wallet without touching the chain', async () => {
    const { result } = renderHook(() => usePayTokenOffer(wallet(), FROM, 'p1'), { wrapper: wrapper() });
    await act(() => result.current.pay({ post, reply: { ...reply, authorWallet: null } }));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('not linked a wallet');
    expect(chain.build).not.toHaveBeenCalled();
  });

  it('shows an invalid-transaction reason as the network states it, once', async () => {
    chain.daemonFetch.mockRejectedValueOnce(new ApiRequestError(422, { code: 'TOKEN_OFFER_TX_INVALID', message: 'amount mismatch' }));
    const { result } = renderHook(() => usePayTokenOffer(wallet(), FROM, 'p1'), { wrapper: wrapper() });
    await act(() => result.current.pay({ post, reply }));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('amount mismatch');
    expect(result.current.replyId).toBe('r1');
  });
});

describe('payErrorMessage', () => {
  it('names the network refusals and a wallet rejection', () => {
    expect(payErrorMessage(new ApiRequestError(409, { code: 'TOKEN_OFFER_OWN_REPLY', message: 'x' }))).toBe('You cannot pay your own reply.');
    expect(payErrorMessage(new ApiRequestError(400, { code: 'TOKEN_OFFER_NONE', message: 'x' }))).toBe('This post has no token offer.');
    expect(payErrorMessage(new ApiRequestError(403, { code: 'TOKEN_OFFER_NOT_AUTHOR', message: 'x' }))).toBe('Only the post author can pay.');
    expect(payErrorMessage(new ApiRequestError(409, { code: 'TOKEN_OFFER_EXHAUSTED', message: 'x' }))).toContain('Every payment');
    expect(payErrorMessage(new ApiRequestError(409, { code: 'TOKEN_OFFER_ALREADY_PAID', message: 'x' }))).toContain('already paid');
    expect(payErrorMessage(new ApiRequestError(400, { code: 'TOKEN_OFFER_NO_WALLET', message: 'x' }))).toContain('not linked a wallet');
    expect(payErrorMessage(Object.assign(new Error('User rejected the request'), { code: 4001 }))).toContain('rejected');
  });
});

describe('payerWalletReason', () => {
  it('blocks while unknown, without a link, or with the wrong wallet connected', () => {
    expect(payerWalletReason(undefined, FROM)).toContain('Checking');
    expect(payerWalletReason(null, FROM)).toBe('Link a wallet in Settings before paying.');
    expect(payerWalletReason('LinkedWallet1111111111111111111111111111111', FROM)).toBe('Connect the wallet linked to this agent: Linked...11111');
    expect(payerWalletReason(FROM, FROM)).toBeNull();
    expect(payerWalletReason(FROM, null)).toBeNull();
  });
});
