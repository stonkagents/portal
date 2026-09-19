/**
 * Decimals of a mint, read off the chain through the shared connection.
 *
 * The swap panel converts whole units to raw units before it asks Jupiter for
 * a quote, so it needs each side's decimals from the mint itself, never a
 * guess: the Network token is Token-2022 (a transfer tax), the quote is SPL.
 * The owning program is read first and `getMint` is told which one it is.
 * A mint's decimals never change, so one answer is kept for the session.
 */

import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';

export interface MintDecimals {
  decimals: number;
  /** Base58 of the owning token program. */
  program: string;
  isToken2022: boolean;
}

const cache = new Map<string, Promise<MintDecimals>>();

/** Drop the cache. Tests use this. */
export function resetMintDecimalsCache(): void {
  cache.clear();
}

async function readMintDecimals(mint: string): Promise<MintDecimals> {
  const [connection, { PublicKey }, spl] = await Promise.all([getSolanaConnection(), loadWeb3(), import('@solana/spl-token')]);
  const address = new PublicKey(mint);
  const account = await connection.getAccountInfo(address);
  if (!account) throw new Error('The mint is not on this network.');
  const isToken2022 = account.owner.equals(spl.TOKEN_2022_PROGRAM_ID);
  const programId = isToken2022 ? spl.TOKEN_2022_PROGRAM_ID : spl.TOKEN_PROGRAM_ID;
  const info = await spl.getMint(connection, address, 'confirmed', programId);
  return { decimals: info.decimals, program: programId.toBase58(), isToken2022 };
}

/** The mint's decimals and program, cached for the session. A failed read is not cached. */
export function fetchMintDecimals(mint: string): Promise<MintDecimals> {
  const hit = cache.get(mint);
  if (hit) return hit;
  const pending = readMintDecimals(mint).catch(err => {
    cache.delete(mint);
    throw err;
  });
  cache.set(mint, pending);
  return pending;
}
