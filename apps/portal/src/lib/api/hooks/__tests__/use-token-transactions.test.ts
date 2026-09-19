/**
 * readTrade: side, trader and both legs of a LaunchLab trade from parsed balances,
 * for a SOL quote and for a token quote such as $STONK.
 */
import { describe, it, expect } from 'vitest';
import { readTrade, type ParsedTx } from '../use-token-transactions';

const MINT = 'MintAAA';
const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
const SOL = 'So11111111111111111111111111111111111111112';
const TRADER = 'TraderWallet';
const VAULT_AUTH = 'PoolAuthority';

interface Balance {
  accountIndex: number;
  mint: string;
  owner: string;
  amount: number;
}

function tx(opts: { pre: Balance[]; post: Balance[]; keys: string[]; lamportsPre?: number[]; lamportsPost?: number[] }): ParsedTx {
  const toEntry = (b: Balance) => ({
    accountIndex: b.accountIndex,
    mint: b.mint,
    owner: b.owner,
    uiTokenAmount: { uiAmount: b.amount, decimals: 6 },
  });
  return {
    slot: 1,
    blockTime: 1,
    transaction: {
      message: {
        accountKeys: opts.keys.map(k => ({ pubkey: k, signer: false, writable: true })),
        instructions: [],
        recentBlockhash: 'x',
      },
      signatures: ['s'],
    },
    meta: {
      fee: 5000,
      err: null,
      preBalances: opts.lamportsPre ?? opts.keys.map(() => 0),
      postBalances: opts.lamportsPost ?? opts.keys.map(() => 0),
      preTokenBalances: opts.pre.map(toEntry),
      postTokenBalances: opts.post.map(toEntry),
      innerInstructions: [],
      logMessages: [],
    },
  } as unknown as ParsedTx;
}

describe('readTrade', () => {
  it('prices the trade from the pool vaults, not the fee-laden trader legs', () => {
    // Trader pays 100 STONK; the pool vault receives 97.75 after the platform fee.
    // The vault gives 2400 AGENT; the trader receives 2376 after the 1% transfer fee.
    const parsed = tx({
      keys: [TRADER, 'ata1', 'ata2', 'vaultA', 'vaultB', 'feeVault'],
      pre: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 0 },
        { accountIndex: 2, mint: STONK, owner: TRADER, amount: 1000 },
        { accountIndex: 3, mint: MINT, owner: VAULT_AUTH, amount: 900_000 },
        { accountIndex: 4, mint: STONK, owner: VAULT_AUTH, amount: 5000 },
        { accountIndex: 5, mint: STONK, owner: 'Platform', amount: 0 },
      ],
      post: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 2376 },
        { accountIndex: 2, mint: STONK, owner: TRADER, amount: 900 },
        { accountIndex: 3, mint: MINT, owner: VAULT_AUTH, amount: 897_600 },
        { accountIndex: 4, mint: STONK, owner: VAULT_AUTH, amount: 5097.75 },
        { accountIndex: 5, mint: STONK, owner: 'Platform', amount: 2.25 },
      ],
    });
    const row = readTrade(parsed, 'sig', 1700, MINT, STONK);
    expect(row.type).toBe('buy');
    expect(row.amountToken).toBe(2376);
    expect(row.amountQuote).toBe(100);
    expect(row.price).toBeCloseTo(97.75 / 2400, 10);
  });

  it('reads a $STONK-quoted buy: base up, quote down, price = quote / base', () => {
    const parsed = tx({
      keys: [TRADER, 'ata1', 'ata2', 'vaultA', 'vaultB'],
      pre: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 0 },
        { accountIndex: 2, mint: STONK, owner: TRADER, amount: 1000 },
        { accountIndex: 3, mint: MINT, owner: VAULT_AUTH, amount: 900_000 },
        { accountIndex: 4, mint: STONK, owner: VAULT_AUTH, amount: 5000 },
      ],
      post: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 2400 },
        { accountIndex: 2, mint: STONK, owner: TRADER, amount: 900 },
        { accountIndex: 3, mint: MINT, owner: VAULT_AUTH, amount: 897_600 },
        { accountIndex: 4, mint: STONK, owner: VAULT_AUTH, amount: 5100 },
      ],
      lamportsPre: [10e9, 0, 0, 0, 0],
      lamportsPost: [10e9 - 5000, 0, 0, 0, 0],
    });

    const row = readTrade(parsed, 'sig', 1700, MINT, STONK);
    expect(row).toMatchObject({ type: 'buy', wallet: TRADER, amountToken: 2400, amountQuote: 100 });
    expect(row.price).toBeCloseTo(100 / 2400);
    // Not a SOL quote: the SOL leg is only the fee, reported for legacy callers.
    expect(row.amountSol).toBeCloseTo(0.000005);
  });

  it('reads a $STONK-quoted sell', () => {
    const parsed = tx({
      keys: [TRADER, 'ata1', 'ata2'],
      pre: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 5000 },
        { accountIndex: 2, mint: STONK, owner: TRADER, amount: 0 },
      ],
      post: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 2000 },
        { accountIndex: 2, mint: STONK, owner: TRADER, amount: 120 },
      ],
    });
    expect(readTrade(parsed, 'sig', 1700, MINT, STONK)).toMatchObject({
      type: 'sell',
      wallet: TRADER,
      amountToken: 3000,
      amountQuote: 120,
      price: 0.04,
    });
  });

  it('reads a SOL-quoted buy from lamports', () => {
    const parsed = tx({
      keys: [TRADER, 'ata1'],
      pre: [{ accountIndex: 1, mint: MINT, owner: TRADER, amount: 0 }],
      post: [{ accountIndex: 1, mint: MINT, owner: TRADER, amount: 100 }],
      lamportsPre: [5e9, 0],
      lamportsPost: [4.5e9, 0],
    });
    const row = readTrade(parsed, 'sig', 1700, MINT, SOL);
    expect(row).toMatchObject({ type: 'buy', amountToken: 100, amountQuote: 0.5, amountSol: 0.5 });
    expect(readTrade(parsed, 'sig', 1700, MINT, null).amountQuote).toBe(0.5);
  });

  it('leaves the quote leg empty when the wallet moved no quote', () => {
    const parsed = tx({
      keys: [TRADER, 'ata1'],
      pre: [{ accountIndex: 1, mint: MINT, owner: TRADER, amount: 0 }],
      post: [{ accountIndex: 1, mint: MINT, owner: TRADER, amount: 100 }],
    });
    const row = readTrade(parsed, 'sig', 1700, MINT, STONK);
    expect(row.type).toBe('buy');
    expect(row.amountQuote).toBeUndefined();
    expect(row.price).toBeUndefined();
  });

  it('falls back to the biggest base mover when the fee payer did not trade', () => {
    const parsed = tx({
      keys: ['Relayer', 'ata1', 'ata2'],
      pre: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 10 },
        { accountIndex: 2, mint: MINT, owner: VAULT_AUTH, amount: 1000 },
      ],
      post: [
        { accountIndex: 1, mint: MINT, owner: TRADER, amount: 0 },
        { accountIndex: 2, mint: MINT, owner: VAULT_AUTH, amount: 1010 },
      ],
    });
    expect(readTrade(parsed, 'sig', 1700, MINT, STONK)).toMatchObject({ type: 'sell', wallet: TRADER, amountToken: 10 });
  });

  it('marks a transaction without base movement as unknown', () => {
    const parsed = tx({ keys: [TRADER], pre: [], post: [] });
    expect(readTrade(parsed, 'sig', null, MINT, STONK)).toEqual({ signature: 'sig', blockTime: null, type: 'unknown' });
    expect(readTrade(null, 'sig', null, MINT, STONK).type).toBe('unknown');
  });
});
