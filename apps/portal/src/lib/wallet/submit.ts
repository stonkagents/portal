/**
 * One way to put a single-signer transaction on chain.
 *
 * The wallet is asked to sign and send in one step (`signAndSendTransaction`),
 * which is what a wallet's domain review looks for: the wallet sees the whole
 * flow and broadcasts it itself. Not every wallet can send, and one that can
 * may refuse the submit or broadcast through a node on the wrong cluster. When
 * the wallet's send throws for any reason other than the user saying no, the
 * flow falls back to what every flow did before: the wallet signs only, and
 * `sendSigned` broadcasts on our own RPC. A rejection is final; the user is
 * never asked twice.
 *
 * Multi-signer flows (a launch, where the mint keypair co-signs) never come
 * through here: they stay on `wallet.sign`.
 */
import type { Transaction, VersionedTransaction } from '@solana/web3.js';
import { isUserRejection } from '@/lib/launchlab/errors';
import type { WalletService } from './types';

export type SignedSender = (signed: Transaction | VersionedTransaction) => Promise<string>;

/** Resolves with the signature the wallet, or our RPC, returned. */
export async function submitViaWallet(
  wallet: Pick<WalletService, 'sign' | 'signAndSend'>,
  tx: Transaction | VersionedTransaction,
  sendSigned: SignedSender,
): Promise<string> {
  try {
    const { signature } = await wallet.signAndSend(tx);
    return signature;
  } catch (err) {
    if (isUserRejection(err)) throw err;
    console.warn('[wallet] signAndSend failed; signing only and sending on our RPC', err);
  }
  const signed = await wallet.sign(tx);
  return sendSigned(signed);
}
