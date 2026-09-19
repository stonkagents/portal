/**
 * Purpose: The on-chain half of paying a token offer (phase 1, section 3).
 *          A post's author pays a reply's author `amount` raw units of the
 *          offered mint, wallet to wallet: the recipient's associated token
 *          account is created when missing (idempotent), the transfer is a
 *          checked SPL transfer under the mint's own program (Token or
 *          Token-2022, read off the mint account), the user pays the fee, and
 *          a memo `stonkagents:offer:<post id>:<reply id>` ties the signature
 *          to the reply for the tracker's verification.
 *
 *          Signing and sending are the caller's (`submitViaWallet`); this file
 *          only builds the transaction and waits for it to land.
 */
import type { Connection, Transaction as TransactionType } from '@solana/web3.js';
import { fetchMintDecimals } from '@/lib/jupiter/mint-decimals';
import { MEMO_PROGRAM_ID } from '@/lib/token-launch/constants';

export interface TokenOfferTransfer {
  postId: string;
  replyId: string;
  mint: string;
  /** Raw units, exactly what the offer promises per reply. */
  amountRaw: number;
  /** Base58 of the payer (the connected wallet). */
  from: string;
  /** Base58 of the reply author's linked wallet. */
  to: string;
}

/** The memo the tracker looks for on a token offer payment. */
export function tokenOfferMemo(postId: string, replyId: string): string {
  return `stonkagents:offer:${postId}:${replyId}`;
}

/**
 * The unsigned transfer, blockhash set, fee payer = `from`. Reads the mint's
 * program and decimals off the chain (cached per session) so the checked
 * transfer carries the right ones whatever the launch used.
 */
export async function buildTokenOfferTransferTx(connection: Connection, transfer: TokenOfferTransfer): Promise<TransactionType> {
  if (!Number.isInteger(transfer.amountRaw) || transfer.amountRaw <= 0) {
    throw new Error('The offer has no amount to pay.');
  }
  const [{ PublicKey, Transaction, TransactionInstruction }, spl, mintInfo] = await Promise.all([
    import('@solana/web3.js'),
    import('@solana/spl-token'),
    fetchMintDecimals(transfer.mint),
  ]);
  const programId = new PublicKey(mintInfo.program);
  const mint = new PublicKey(transfer.mint);
  const from = new PublicKey(transfer.from);
  const to = new PublicKey(transfer.to);
  const fromAta = spl.getAssociatedTokenAddressSync(mint, from, false, programId, spl.ASSOCIATED_TOKEN_PROGRAM_ID);
  const toAta = spl.getAssociatedTokenAddressSync(mint, to, false, programId, spl.ASSOCIATED_TOKEN_PROGRAM_ID);

  const tx = new Transaction().add(
    spl.createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, mint, programId, spl.ASSOCIATED_TOKEN_PROGRAM_ID),
    spl.createTransferCheckedInstruction(fromAta, mint, toAta, from, BigInt(transfer.amountRaw), mintInfo.decimals, [], programId),
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(tokenOfferMemo(transfer.postId, transfer.replyId), 'utf8'),
    }),
  );
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  return tx;
}

export const FINALIZE_POLL_MS = 3000;
export const FINALIZE_MAX_POLLS = 30;

/**
 * Polls `getSignatureStatus` over HTTP until the transaction is finalized (the
 * tracker verifies at that commitment) or the budget runs out. No websocket:
 * the RPC tier in use rejects subscriptions.
 */
export async function waitForFinalized(
  connection: Pick<Connection, 'getSignatureStatus'>,
  signature: string,
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<void> {
  for (let i = 0; i < FINALIZE_MAX_POLLS; i++) {
    await sleep(FINALIZE_POLL_MS);
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (status.value?.err) {
      throw new Error(`The transfer failed on chain: ${JSON.stringify(status.value.err)}`);
    }
    if (status.value?.confirmationStatus === 'finalized') return;
  }
  throw new Error('The transfer has not finalized after 90 seconds. It may still land: do not pay again.');
}
