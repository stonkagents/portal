// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AddressLookupTableAccount, Keypair, SystemProgram, TransactionInstruction, VersionedTransaction, type PublicKey } from '@solana/web3.js';
import { compileLaunchMessage } from './build-launch';
import { MAX_TRANSACTION_BYTES } from './constants';

const payer = Keypair.generate();
const blockhash = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';

function table(addresses: PublicKey[]): AddressLookupTableAccount {
  return new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: { deactivationSlot: BigInt('18446744073709551615'), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses },
  });
}

/** One instruction touching `count` distinct accounts, all of them listed in the table. */
function touching(count: number): { ix: TransactionInstruction; table: AddressLookupTableAccount } {
  const keys = Array.from({ length: count }, () => Keypair.generate().publicKey);
  const ix = new TransactionInstruction({
    programId: SystemProgram.programId,
    keys: keys.map(pubkey => ({ pubkey, isSigner: false, isWritable: true })),
    data: Buffer.alloc(0),
  });
  return { ix, table: table(keys) };
}

describe('compileLaunchMessage', () => {
  it('leaves the lookup tables out when the plain transaction fits the packet', () => {
    const { ix, table } = touching(12);
    const message = compileLaunchMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ix] }, [table]);
    expect(message.addressTableLookups).toHaveLength(0);
    expect(new VersionedTransaction(message).serialize().length).toBeLessThanOrEqual(MAX_TRANSACTION_BYTES);
  });

  it('falls back to the lookup tables only when plain addresses would not fit', () => {
    const { ix, table } = touching(40);
    const message = compileLaunchMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ix] }, [table]);
    expect(message.addressTableLookups).toHaveLength(1);
    expect(new VersionedTransaction(message).serialize().length).toBeLessThanOrEqual(MAX_TRANSACTION_BYTES);
  });

  it('compiles plainly when there are no tables to fall back to', () => {
    const { ix } = touching(3);
    const message = compileLaunchMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ix] }, []);
    expect(message.addressTableLookups).toHaveLength(0);
  });
});
