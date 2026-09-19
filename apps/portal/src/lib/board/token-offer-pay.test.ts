// @vitest-environment node
/**
 * The on-chain half of a token offer payment against a fake RPC: the transfer
 * creates the recipient's ATA (idempotent), moves exactly the raw amount under
 * the mint's own program (Token-2022 here), carries the memo the tracker looks
 * for, and is paid for by the sender; the finality wait stops on an error or
 * after its budget. Node realm on purpose: web3.js's byte checks reject
 * jsdom's Uint8Array.
 */
import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, type Connection } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { MEMO_PROGRAM_ID } from '@/lib/token-launch/constants';

const mintInfo = vi.hoisted(() => ({ decimals: 6, program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', isToken2022: true }));
vi.mock('@/lib/jupiter/mint-decimals', () => ({ fetchMintDecimals: async () => mintInfo }));

import { FINALIZE_MAX_POLLS, buildTokenOfferTransferTx, tokenOfferMemo, waitForFinalized } from './token-offer-pay';

const from = Keypair.generate().publicKey;
const to = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

function connection(): Connection {
  return { getLatestBlockhash: vi.fn(async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1 })) } as unknown as Connection;
}

describe('tokenOfferMemo', () => {
  it('is the tracker contract string', () => {
    expect(tokenOfferMemo('p1', 'r2')).toBe('stonkagents:offer:p1:r2');
  });
});

describe('buildTokenOfferTransferTx', () => {
  it('creates the recipient ATA, transfers the raw amount under Token-2022, memos the reply and charges the sender', async () => {
    const tx = await buildTokenOfferTransferTx(connection(), {
      postId: 'p1',
      replyId: 'r2',
      mint: mint.toBase58(),
      amountRaw: 1_500_000,
      from: from.toBase58(),
      to: to.toBase58(),
    });
    expect(tx.feePayer?.equals(from)).toBe(true);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.instructions).toHaveLength(3);

    const [ata, transfer, memo] = tx.instructions;
    expect(ata.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    const toAta = getAssociatedTokenAddressSync(mint, to, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    expect(ata.keys[1].pubkey.equals(toAta)).toBe(true);
    expect(ata.keys[0].pubkey.equals(from)).toBe(true);

    expect(transfer.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    /* TransferChecked: [12, amount u64 LE, decimals] */
    expect(transfer.data[0]).toBe(12);
    expect(Number(transfer.data.readBigUInt64LE(1))).toBe(1_500_000);
    expect(transfer.data[9]).toBe(6);
    const fromAta = getAssociatedTokenAddressSync(mint, from, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    expect(transfer.keys[0].pubkey.equals(fromAta)).toBe(true);
    expect(transfer.keys[2].pubkey.equals(toAta)).toBe(true);
    expect(transfer.keys[3].pubkey.equals(from)).toBe(true);
    expect(transfer.keys[3].isSigner).toBe(true);

    expect(memo.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(memo.data.toString('utf8')).toBe('stonkagents:offer:p1:r2');
  });

  it('uses the classic Token program when the mint lives there', async () => {
    mintInfo.program = TOKEN_PROGRAM_ID.toBase58();
    mintInfo.isToken2022 = false;
    const tx = await buildTokenOfferTransferTx(connection(), {
      postId: 'p',
      replyId: 'r',
      mint: mint.toBase58(),
      amountRaw: 1,
      from: from.toBase58(),
      to: to.toBase58(),
    });
    expect(tx.instructions[1].programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(tx.instructions[1].programId.equals(new PublicKey(TOKEN_2022_PROGRAM_ID))).toBe(false);
  });

  it('refuses an amount that is not a positive integer', async () => {
    await expect(
      buildTokenOfferTransferTx(connection(), { postId: 'p', replyId: 'r', mint: mint.toBase58(), amountRaw: 0, from: from.toBase58(), to: to.toBase58() }),
    ).rejects.toThrow('no amount');
  });
});

describe('waitForFinalized', () => {
  const sleep = async () => {};

  it('returns once the signature is finalized', async () => {
    const getSignatureStatus = vi
      .fn()
      .mockResolvedValueOnce({ value: { confirmationStatus: 'confirmed', err: null } })
      .mockResolvedValueOnce({ value: { confirmationStatus: 'finalized', err: null } });
    await expect(waitForFinalized({ getSignatureStatus } as never, 'sig', sleep)).resolves.toBeUndefined();
    expect(getSignatureStatus).toHaveBeenCalledTimes(2);
  });

  it('throws on an on-chain error and after the budget', async () => {
    await expect(
      waitForFinalized({ getSignatureStatus: vi.fn(async () => ({ value: { err: { InstructionError: [1, 'Custom'] } } })) } as never, 'sig', sleep),
    ).rejects.toThrow('failed on chain');
    const never = vi.fn(async () => ({ value: null }));
    await expect(waitForFinalized({ getSignatureStatus: never } as never, 'sig', sleep)).rejects.toThrow('has not finalized');
    expect(never).toHaveBeenCalledTimes(FINALIZE_MAX_POLLS);
  });
});
