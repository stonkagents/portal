/**
 * Purpose: Tests for usePurchaseCredits hook — intent→signAndSend (or sign + own RPC)→verify flow
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { WalletService } from '@/lib/wallet/types';
import type { CreditTier } from '@/lib/types';

// Mock @solana/web3.js for jsdom
vi.mock('@solana/web3.js', () => {
  class MockPublicKey {
    private key: string;
    constructor(key: string) {
      this.key = key;
    }
    toBase58() {
      return this.key;
    }
  }
  class MockTransaction {
    instructions: unknown[] = [];
    recentBlockhash: string | null = null;
    feePayer: unknown = null;
    add(...ixs: unknown[]) {
      this.instructions.push(...ixs);
      return this;
    }
    serialize() {
      return new Uint8Array([1, 2, 3]);
    }
  }
  class MockConnection {
    async getLatestBlockhash() {
      return { blockhash: 'mockBlockhash123', lastValidBlockHeight: 100 };
    }
  }
  return {
    PublicKey: MockPublicKey,
    Transaction: MockTransaction,
    TransactionInstruction: class {
      constructor(public opts: unknown) {}
    },
    Connection: MockConnection,
    SystemProgram: {
      transfer: (params: { fromPubkey: unknown; toPubkey: unknown; lamports: number }) => ({
        programId: new MockPublicKey('11111111111111111111111111111111'),
        lamports: params.lamports,
      }),
    },
    LAMPORTS_PER_SOL: 1_000_000_000,
  };
});

// Mock the shared RPC connection the hook reads the blockhash and status from, and sends through
// only when the wallet could not send itself (sign-only via Phantom, send via our RPC).
// Hoisted so the per-test assertions below can reach the spies.
const { mockSendRawTransaction, mockGetSignatureStatus } = vi.hoisted(() => ({
  mockSendRawTransaction: vi.fn().mockResolvedValue('mockSig123'),
  mockGetSignatureStatus: vi.fn().mockResolvedValue({ value: { confirmationStatus: 'finalized', err: null } }),
}));
vi.mock('@/lib/solana/connection', () => ({
  getSolanaConnection: async () => ({
    getLatestBlockhash: async () => ({ blockhash: 'mockBlockhash123', lastValidBlockHeight: 100 }),
    sendRawTransaction: mockSendRawTransaction,
    getSignatureStatus: mockGetSignatureStatus,
  }),
}));

// Mock daemon-credits purchase API
vi.mock('@/lib/api/daemon-credits', () => ({
  purchaseApi: {
    createIntent: vi.fn().mockResolvedValue({
      intent_id: 'intent_abc123',
      treasury_address: '99999999999999999999999999999999',
      amount_lamports: 450_000_000,
      credit_amount: 500,
      memo: 'clawagent-purchase:intent_abc123',
      expires_at: '2026-02-14T00:00:00Z',
    }),
    verify: vi.fn().mockResolvedValue({
      credits_granted: 500,
      new_balance: { free: 50, paid: 500 },
    }),
  },
}));

// Mock DaemonProvider
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({ connected: true }),
}));

const { usePurchaseCredits } = await import('../use-purchase-credits');
const { purchaseApi } = await import('@/lib/api/daemon-credits');

/** The hook polls finalization on a 3s timer — drive it with fake timers so the test stays fast. */
const FINALIZATION_POLL_MS = 3000;
async function purchaseWithFakeTimers(purchase: () => Promise<void>) {
  vi.useFakeTimers();
  try {
    await act(async () => {
      const pending = purchase();
      await vi.advanceTimersByTimeAsync(FINALIZATION_POLL_MS);
      await pending;
    });
  } finally {
    vi.useRealTimers();
  }
}

const MOCK_TIER: CreditTier = { id: 'pro', credits: 500, solPrice: 0.45, label: 'Pro', popular: true };

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function createMockWallet(overrides: Partial<WalletService> = {}): WalletService {
  return {
    installed: true,
    connected: true,
    publicKey: '11111111111111111111111111111112',
    shortAddress: '1111...1112',
    balance: 10,
    connecting: false,
    error: null,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    fetchBalance: vi.fn().mockResolvedValue(undefined),
    sign: vi.fn().mockImplementation((tx: unknown) => Promise.resolve(tx)),
    signAndSend: vi.fn().mockResolvedValue({ signature: 'mockSig123' }),
    ...overrides,
  };
}

describe('usePurchaseCredits', () => {
  beforeEach(() => {
    // Module-level spies keep their resolved values; only the call history is reset per test
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const wallet = createMockWallet();
    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('calls wallet.connect if not connected', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const wallet = createMockWallet({
      connected: false,
      publicKey: null,
      connect,
    });

    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });

    await act(async () => {
      try {
        await result.current.purchase(MOCK_TIER);
      } catch {
        /* expected — publicKey null after mock connect */
      }
    });

    expect(connect).toHaveBeenCalled();
  });

  it('transitions to error on wallet rejection, without asking the wallet a second time', async () => {
    const wallet = createMockWallet({
      signAndSend: vi.fn().mockRejectedValue(new Error('User rejected the request')),
    });

    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.purchase(MOCK_TIER);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('rejected');
    // Rejected in the wallet — no sign-only retry, nothing broadcast or verified
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(mockSendRawTransaction).not.toHaveBeenCalled();
    expect(purchaseApi.verify).not.toHaveBeenCalled();
  });

  it('reset returns to idle and clears error', async () => {
    const wallet = createMockWallet({
      signAndSend: vi.fn().mockRejectedValue(new Error('User rejected')),
    });

    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.purchase(MOCK_TIER);
    });

    expect(result.current.status).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('completes purchase successfully with connected wallet', async () => {
    const wallet = createMockWallet();
    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });

    await purchaseWithFakeTimers(() => result.current.purchase(MOCK_TIER));

    expect(result.current.status).toBe('success');
    expect(result.current.result).toBeDefined();
    expect(result.current.result!.credits_granted).toBe(500);

    // The wallet signs and sends itself; our RPC only reads the status, then the tracker verifies
    expect(purchaseApi.createIntent).toHaveBeenCalledWith(450_000_000);
    expect(wallet.signAndSend).toHaveBeenCalledTimes(1);
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(mockSendRawTransaction).not.toHaveBeenCalled();
    expect(mockGetSignatureStatus).toHaveBeenCalledWith('mockSig123', { searchTransactionHistory: true });
    expect(purchaseApi.verify).toHaveBeenCalledWith('intent_abc123', 'mockSig123');
  });

  it('falls back to sign-only plus our own RPC when the wallet cannot send', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wallet = createMockWallet({
      signAndSend: vi.fn().mockRejectedValue(new Error('Failed to send transaction')),
    });
    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });

    await purchaseWithFakeTimers(() => result.current.purchase(MOCK_TIER));

    expect(result.current.status).toBe('success');
    expect(wallet.signAndSend).toHaveBeenCalledTimes(1);
    expect(wallet.sign).toHaveBeenCalledTimes(1);
    expect(mockSendRawTransaction).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), { skipPreflight: true });
    expect(purchaseApi.verify).toHaveBeenCalledWith('intent_abc123', 'mockSig123');
  });

  it('fails with the insufficient-balance message before prompting the wallet', async () => {
    const wallet = createMockWallet({ balance: 0.1 });
    const { result } = renderHook(() => usePurchaseCredits(wallet), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.purchase(MOCK_TIER);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/insufficient sol balance/i);
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(purchaseApi.createIntent).not.toHaveBeenCalled();
  });
});
