// @vitest-environment node
/**
 * The chain side of a swap against Jupiter's recorded build and a fake RPC:
 * the base64 decodes to a v0 transaction for the trader, the send keeps
 * preflight on, the confirm waits on the transaction's own blockhash and
 * the build's block height, and a failed or unconfirmed landing throws.
 * Node realm on purpose: web3.js's byte checks reject jsdom's Uint8Array.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { VersionedTransaction, type Connection } from '@solana/web3.js';
import { base64ToBytes, confirmSwap, decodeSwapTransaction, sendSignedSwap, sendSwap } from './swap-transaction';

vi.mock('@/lib/solana/connection', () => ({
  getSolanaConnection: async () => {
    throw new Error('no RPC in this test');
  },
  loadWeb3: () => import('@solana/web3.js'),
}));

const TRADER = 'FWxdnjw6oYjRWHxBrmQ9eAQoWmn1z1fYNxU7mNjRZtho';
const swap = JSON.parse(readFileSync(join(__dirname, '..', 'api', '__fixtures__', 'jupiter', 'swap.json'), 'utf8')) as {
  swapTransaction: string;
  lastValidBlockHeight: number;
};
const SIG = 'SIG1111111111111111111111111111111111111111111111111111111111111111111111111111111111111';

type FakeConnection = Connection & {
  sendRawTransaction: ReturnType<typeof vi.fn>;
  confirmTransaction: ReturnType<typeof vi.fn>;
  getSignatureStatus: ReturnType<typeof vi.fn>;
};

function fakeConnection(overrides: Partial<Record<'sendRawTransaction' | 'confirmTransaction' | 'getSignatureStatus', unknown>> = {}) {
  return {
    sendRawTransaction: vi.fn(async () => SIG),
    confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    getSignatureStatus: vi.fn(async () => ({ value: { confirmationStatus: 'confirmed', err: null } })),
    ...overrides,
  } as unknown as FakeConnection;
}

describe('decodeSwapTransaction', () => {
  it('decodes base64 without Buffer and reads a v0 transaction the trader pays for', async () => {
    expect(Array.from(base64ToBytes('AQID'))).toEqual([1, 2, 3]);
    const tx = await decodeSwapTransaction(swap.swapTransaction);
    expect(tx).toBeInstanceOf(VersionedTransaction);
    expect(tx.version).toBe(0);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(TRADER);
    expect(tx.signatures).toHaveLength(1);
    expect(tx.message.recentBlockhash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    // Round trip: what the wallet returns re-serializes to the bytes Jupiter sent.
    expect(Array.from(tx.serialize())).toEqual(Array.from(base64ToBytes(swap.swapTransaction)));
  });
});

describe('sendSwap', () => {
  it('sends the signed bytes with preflight on and confirms against the blockhash and block height', async () => {
    const tx = await decodeSwapTransaction(swap.swapTransaction);
    const connection = fakeConnection();
    const signature = await sendSwap(tx, { lastValidBlockHeight: swap.lastValidBlockHeight, connection });
    expect(signature).toBe(SIG);
    expect(connection.sendRawTransaction).toHaveBeenCalledWith(expect.any(Uint8Array), { skipPreflight: false, maxRetries: 2 });
    expect(Array.from(connection.sendRawTransaction.mock.calls[0][0] as Uint8Array)).toEqual(Array.from(tx.serialize()));
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      { signature: SIG, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: swap.lastValidBlockHeight },
      'confirmed',
    );
    expect(connection.getSignatureStatus).not.toHaveBeenCalled();
  });

  it('throws the on-chain error when the transaction landed and failed', async () => {
    const tx = await decodeSwapTransaction(swap.swapTransaction);
    const connection = fakeConnection({
      confirmTransaction: vi.fn(async () => ({ value: { err: { InstructionError: [4, { Custom: 6001 }] } } })),
      getSignatureStatus: vi.fn(async () => ({
        value: { confirmationStatus: 'confirmed', err: { InstructionError: [4, { Custom: 6001 }] } },
      })),
    });
    await expect(sendSwap(tx, { lastValidBlockHeight: 1, connection })).rejects.toThrow(/"Custom":6001/);
  });

  it('asks the network once more when the confirm times out, and trusts a landed transaction', async () => {
    const tx = await decodeSwapTransaction(swap.swapTransaction);
    const landed = fakeConnection({
      confirmTransaction: vi.fn(async () => {
        throw new Error('block height exceeded');
      }),
    });
    await expect(sendSwap(tx, { lastValidBlockHeight: 1, connection: landed })).resolves.toBe(SIG);
    expect(landed.getSignatureStatus).toHaveBeenCalledWith(SIG);

    const lost = fakeConnection({
      confirmTransaction: vi.fn(async () => {
        throw new Error('block height exceeded');
      }),
      getSignatureStatus: vi.fn(async () => ({ value: null })),
    });
    await expect(sendSwap(tx, { lastValidBlockHeight: 1, connection: lost })).rejects.toThrow('block height exceeded');
  });
});

describe('sendSignedSwap and confirmSwap, apart', () => {
  it('sends with preflight on and returns the signature without waiting', async () => {
    const tx = await decodeSwapTransaction(swap.swapTransaction);
    const connection = fakeConnection();
    await expect(sendSignedSwap(tx, connection)).resolves.toBe(SIG);
    expect(connection.sendRawTransaction).toHaveBeenCalledWith(expect.any(Uint8Array), { skipPreflight: false, maxRetries: 2 });
    expect(connection.confirmTransaction).not.toHaveBeenCalled();
  });

  it('confirms a signature the wallet broadcast against the given blockhash and block height', async () => {
    const connection = fakeConnection();
    await expect(confirmSwap(SIG, { blockhash: 'HASH', lastValidBlockHeight: 7, connection })).resolves.toBeUndefined();
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
    expect(connection.confirmTransaction).toHaveBeenCalledWith({ signature: SIG, blockhash: 'HASH', lastValidBlockHeight: 7 }, 'confirmed');

    const failed = fakeConnection({
      confirmTransaction: vi.fn(async () => ({ value: { err: { InstructionError: [4, { Custom: 6001 }] } } })),
      getSignatureStatus: vi.fn(async () => ({ value: { confirmationStatus: 'confirmed', err: { InstructionError: [4, { Custom: 6001 }] } } })),
    });
    await expect(confirmSwap(SIG, { blockhash: 'HASH', lastValidBlockHeight: 7, connection: failed })).rejects.toThrow(/"Custom":6001/);
  });
});
