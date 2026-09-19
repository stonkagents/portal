// @vitest-environment node
/**
 * Purpose: the byte round-trip that sidesteps @solana/connector's
 *          legacy-vs-versioned misdetection on the wallet's return path.
 */
import { describe, it, expect } from 'vitest';
import { Keypair, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { signViaBytes, signedBytesOf, toWalletBytes } from '../sign-bytes';

const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';

describe('signViaBytes', () => {
  it('signs a v0 transaction through raw bytes and rebuilds a VersionedTransaction', async () => {
    const payer = Keypair.generate();
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    // byte 0 of a serialized transaction is the signature count, not the
    // version marker — exactly what the connector gets wrong.
    expect((await toWalletBytes(tx))[0]).toBe(1);

    const signed = await signViaBytes(async bytes => {
      expect(bytes).toBeInstanceOf(Uint8Array);
      const walletSide = VersionedTransaction.deserialize(bytes);
      walletSide.sign([payer]);
      return walletSide.serialize();
    }, tx);

    expect(signed).toBeInstanceOf(VersionedTransaction);
    expect(signed.signatures[0].some(b => b !== 0)).toBe(true);
  });

  it('keeps a pre-existing partial signature (mint keypair) and lets the wallet fill the payer slot', async () => {
    const payer = Keypair.generate();
    const mint = Keypair.generate();
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [
        {
          programId: Keypair.generate().publicKey,
          keys: [{ pubkey: mint.publicKey, isSigner: true, isWritable: true }],
          data: Buffer.alloc(0),
        },
      ],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([mint]);

    const signed = await signViaBytes(async bytes => {
      const walletSide = VersionedTransaction.deserialize(bytes);
      expect(walletSide.signatures[1].some(b => b !== 0)).toBe(true); // mint signature travelled
      walletSide.sign([payer]);
      return walletSide.serialize();
    }, tx);

    expect(signed.signatures[0].some(b => b !== 0)).toBe(true);
    expect(signed.signatures[1]).toEqual(tx.signatures[1]);
  });

  it('signs a legacy transaction through raw bytes and rebuilds a Transaction', async () => {
    const payer = Keypair.generate();
    const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: BLOCKHASH });
    const signed = await signViaBytes(async bytes => {
      const walletSide = Transaction.from(bytes);
      walletSide.sign(payer);
      return walletSide.serialize();
    }, tx);
    expect(signed).toBeInstanceOf(Transaction);
    expect(signed.signatures[0].signature).not.toBeNull();
  });

  it('accepts the response shapes connector adapters have used', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(signedBytesOf(bytes)).toBe(bytes);
    expect(signedBytesOf([bytes])).toBe(bytes);
    expect(signedBytesOf({ signedTransaction: bytes })).toBe(bytes);
    expect(signedBytesOf({ serialize: () => bytes })).toBe(bytes);
    expect(() => signedBytesOf({})).toThrow(/unexpected/);
  });
});
