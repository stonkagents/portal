/**
 * The chain side of a Jupiter swap: the base64 transaction Jupiter built,
 * decoded for the wallet, then confirmed against the block height Jupiter's
 * build is valid to. The wallet sends it itself when it can; otherwise it
 * signs only and the send goes on our own RPC.
 *
 * Preflight stays on for a swap (unlike a launch): the wallet may not
 * simulate, and a swap that fails on chain still costs the fee. A confirm
 * that errors out is asked about once more before it is called failed.
 */

import type { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';

/** Base64 to bytes without Buffer, which the browser bundle does not carry. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The transaction Jupiter built, as web3.js's class, ready for the wallet. */
export async function decodeSwapTransaction(swapTransaction: string): Promise<VersionedTransaction> {
  const { VersionedTransaction: Versioned } = await loadWeb3();
  return Versioned.deserialize(base64ToBytes(swapTransaction));
}

export interface SendSwapOptions {
  lastValidBlockHeight: number;
  connection?: Connection;
}

export interface ConfirmSwapOptions extends SendSwapOptions {
  /** The blockhash the transaction was built on; the confirm expires with it. */
  blockhash: string;
}

/** Send the wallet-signed swap on our own RPC, preflight on. Resolves with the signature. */
export async function sendSignedSwap(signed: VersionedTransaction | Transaction, connection?: Connection): Promise<string> {
  const rpc = connection ?? (await getSolanaConnection());
  return rpc.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
}

/**
 * Wait for a sent swap, whoever broadcast it. Rejects with the chain's error
 * when the transaction landed and failed.
 */
export async function confirmSwap(signature: string, options: ConfirmSwapOptions): Promise<void> {
  const connection = options.connection ?? (await getSolanaConnection());
  const { blockhash, lastValidBlockHeight } = options;

  let failure: unknown = null;
  try {
    const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    if (result.value.err) failure = new Error(`Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
  } catch (confirmErr) {
    failure = confirmErr;
  }
  if (failure) {
    // The confirm can time out on a transaction that did land; the network has the last word.
    const status = await connection.getSignatureStatus(signature).catch(() => null);
    const state = status?.value?.confirmationStatus;
    if (status?.value?.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.value.err)}`);
    if (state !== 'confirmed' && state !== 'finalized') throw failure;
  }
}

/** Send the wallet-signed swap on our own RPC and wait for it. Resolves with the signature. */
export async function sendSwap(signed: VersionedTransaction, options: SendSwapOptions): Promise<string> {
  const connection = options.connection ?? (await getSolanaConnection());
  const signature = await sendSignedSwap(signed, connection);
  await confirmSwap(signature, { blockhash: signed.message.recentBlockhash, lastValidBlockHeight: options.lastValidBlockHeight, connection });
  return signature;
}
