import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const signTransaction = vi.fn();
const signAndSendTransaction = vi.fn();
const fakeTx = { kind: 'fake' };
const rebuilt = { kind: 'rebuilt' };
vi.mock('../sign-bytes', () => ({
  signViaBytes: async (signer: (b: Uint8Array) => Promise<unknown>, tx: unknown) => {
    if (tx !== fakeTx) throw new Error('unexpected tx');
    await signer(new Uint8Array([7]));
    return rebuilt;
  },
  toWalletBytes: async (tx: unknown) => {
    if (tx !== fakeTx) throw new Error('unexpected tx');
    return new Uint8Array([7]);
  },
}));
const cluster = { id: 'solana:devnet', label: 'Devnet' };

/* The connector module as SolanaProvider hands it down once loaded. */
const connectorModule = {
  useWallet: () => ({ isConnected: true, isConnecting: false }),
  useAccount: () => ({ address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' }),
  useConnectWallet: () => ({ connect: vi.fn(), error: null }),
  useDisconnectWallet: () => ({ disconnect: vi.fn() }),
  useBalance: () => ({ solBalance: 1, refetch: vi.fn() }),
  useTransactionSigner: () => ({ signer: { signTransaction, signAndSendTransaction } }),
  useWalletConnectors: () => [{ id: 'wallet-standard:phantom', name: 'Phantom', ready: true }],
  useCluster: () => ({ cluster }),
} as unknown as ConnectorModule;

import { WalletReadyProvider, type ConnectorModule } from '@/providers/WalletReadyProvider';
import { useRealWallet } from '../real-wallet';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(WalletReadyProvider, { connector: connectorModule, children });

/** What @solana/connector throws around the wallet's own error. */
function signingFailed(inner: unknown) {
  const wrapper = new Error('Failed to sign transaction') as Error & { code: string; originalError: unknown };
  wrapper.code = 'SIGNING_FAILED';
  wrapper.originalError = inner;
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('useRealWallet', () => {
  it("reports the connector's cluster as the wallet network", () => {
    const { result } = renderHook(() => useRealWallet(), { wrapper });
    expect(result.current.network).toBe('solana:devnet');
    expect(result.current.connected).toBe(true);
  });

  it('reports installed when any connector is ready, not only Phantom', () => {
    const { result } = renderHook(() => useRealWallet(), { wrapper });
    expect(result.current.installed).toBe(true);
  });

  /* A connector module with the given connection state and last connect error. */
  function moduleWith(isConnected: boolean, error: Error | null): ConnectorModule {
    return {
      ...connectorModule,
      useWallet: () => ({ isConnected, isConnecting: false }),
      useAccount: () => ({ address: isConnected ? '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' : null }),
      useConnectWallet: () => ({ connect: vi.fn(), error }),
    } as unknown as ConnectorModule;
  }
  const wrapperWith = (mod: ConnectorModule) => ({ children }: { children: ReactNode }) =>
    createElement(WalletReadyProvider, { connector: mod, children });

  it('surfaces a connector error while disconnected', () => {
    const { result } = renderHook(() => useRealWallet(), { wrapper: wrapperWith(moduleWith(false, new Error('Wallet not found'))) });
    expect(result.current.error).toBe('Wallet not found');
  });

  it("hides a cancellation the user caused (WalletConnect's 'Connection cancelled')", () => {
    const { result } = renderHook(() => useRealWallet(), { wrapper: wrapperWith(moduleWith(false, new Error('Connection cancelled'))) });
    expect(result.current.error).toBeNull();
  });

  it('shows no error once a wallet is connected, even if the connector kept an earlier one', () => {
    const { result } = renderHook(() => useRealWallet(), { wrapper: wrapperWith(moduleWith(true, new Error('Wallet not found'))) });
    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('throws outside the connector module context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useRealWallet())).toThrow(/ConnectorKit module/);
  });

  it("rethrows a signing failure with the wallet's own message and the chain as cause", async () => {
    const inner = Object.assign(new Error('Phantom: Transaction reverted during simulation'), { code: -32603 });
    signTransaction.mockRejectedValueOnce(signingFailed(inner));
    const { result } = renderHook(() => useRealWallet(), { wrapper });

    const failure = (await result.current.sign(fakeTx as never).catch((err: unknown) => err)) as Error & {
      code?: unknown;
      cause?: unknown;
    };
    expect(failure.message).toBe('Phantom: Transaction reverted during simulation');
    expect(failure.code).toBe('SIGNING_FAILED');
    expect((failure.cause as { originalError: unknown }).originalError).toBe(inner);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('round-trips the transaction through the byte signer', async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    signTransaction.mockResolvedValueOnce(bytes);
    const { result } = renderHook(() => useRealWallet(), { wrapper });
    await expect(result.current.sign(fakeTx as never)).resolves.toBe(rebuilt);
    expect(signTransaction).toHaveBeenCalledWith(new Uint8Array([7]));
  });

  it('signAndSend hands the wallet bytes and returns the signature it broadcast', async () => {
    signAndSendTransaction.mockResolvedValueOnce('SIG-FROM-WALLET');
    const { result } = renderHook(() => useRealWallet(), { wrapper });
    await expect(result.current.signAndSend(fakeTx as never)).resolves.toEqual({ signature: 'SIG-FROM-WALLET' });
    expect(signAndSendTransaction).toHaveBeenCalledWith(new Uint8Array([7]));
  });

  it("signAndSend rethrows a send failure with the wallet's own message, the code, and the chain as cause", async () => {
    const inner = Object.assign(new Error('User rejected the request.'), { code: 4001 });
    const wrapped = Object.assign(new Error('Failed to send transaction'), { code: 'SEND_FAILED', originalError: inner });
    signAndSendTransaction.mockRejectedValueOnce(wrapped);
    const { result } = renderHook(() => useRealWallet(), { wrapper });

    const failure = (await result.current.signAndSend(fakeTx as never).catch((err: unknown) => err)) as Error & { code?: unknown };
    expect(failure.message).toBe('User rejected the request.');
    expect(failure.code).toBe('SEND_FAILED');
    expect(failure.cause).toBe(wrapped);
  });
});
