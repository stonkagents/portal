/**
 * Purpose: Shared WalletService interface for mock + real wallet implementations
 */
import type { Transaction, VersionedTransaction } from '@solana/web3.js';

export interface WalletService {
  /**
   * At least one wallet is ready to connect in this browser (an injected
   * extension, or Mobile Wallet Adapter on Android). `connect()` works either
   * way: without one, the connect prompt offers install links and mobile
   * deep links instead of a wallet list.
   */
  installed: boolean;
  /** Whether wallet is connected */
  connected: boolean;
  /** Full base58 public key */
  publicKey: string | null;
  /** Abbreviated address for display (e.g. "7a3b...9f2c") */
  shortAddress: string | null;
  /** SOL balance (null until fetched) */
  balance: number | null;
  /** Connection loading state */
  connecting: boolean;
  /** Last error message */
  error: string | null;
  /**
   * Cluster the wallet session is on, as the connector reports it
   * ('solana:devnet', 'solana:mainnet', ...). Null when unknown; undefined on the mock.
   */
  network?: string | null;
  /**
   * Open the shared connect prompt. Resolves true once a wallet is connected,
   * false when the visitor dismissed the prompt. Never rejects.
   */
  connect: () => Promise<boolean>;
  /** Disconnect wallet */
  disconnect: () => Promise<void>;
  /** Refresh balance */
  fetchBalance: () => Promise<void>;
  /** Sign a transaction without sending (returns the signed tx) */
  sign: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  /** Sign and send a transaction, return signature */
  signAndSend: (tx: Transaction | VersionedTransaction) => Promise<{ signature: string }>;
}

export function abbreviateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-5)}`;
}
