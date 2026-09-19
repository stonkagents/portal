/**
 * Token detail: check if connected wallet holds any balance of the given mint.
 */

import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useMemo } from 'react';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { getSolanaConnection } from '@/lib/solana/connection';

type HolderBalanceOptions = {
  ataOnly?: boolean;
};

async function fetchHolderBalance(mint: string, owner: string | null, options?: HolderBalanceOptions): Promise<number> {
  if (!owner) return 0;
  const connection = await getSolanaConnection();
  const mintPubkey = new PublicKey(mint);
  const ownerPubkey = new PublicKey(owner);

  if (options?.ataOnly) {
    const mintInfo = await connection.getAccountInfo(mintPubkey);
    if (!mintInfo) return 0;
    const tokenProgramId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
    const ataBalance = await connection.getTokenAccountBalance(ata).catch(() => null);
    return ataBalance ? Number(ataBalance.value.amount) : 0;
  }

  const accounts = await connection.getParsedTokenAccountsByOwner(ownerPubkey, { mint: mintPubkey });
  if (accounts.value.length === 0) return 0;
  return accounts.value.reduce((sum, account) => {
    const amount = account.account.data.parsed?.info?.tokenAmount?.amount;
    return sum + (amount ? Number(amount) : 0);
  }, 0);
}

/** The query key one balance read lives under; `['holder-balance', mint]` is the prefix an invalidation uses. */
export function holderBalanceQueryKey(mint: string | null, owner: string | null, ataOnly = false): readonly string[] {
  return ['holder-balance', mint ?? '', owner ?? '', ataOnly ? 'ata-only' : 'all'];
}

export function useHolderBalance(mint: string | null, owner: string | null, options?: HolderBalanceOptions) {
  const ataOnly = options?.ataOnly === true;
  const queryKey = useMemo(() => holderBalanceQueryKey(mint, owner, ataOnly), [mint, owner, ataOnly]);
  const enabled = Boolean(mint && owner);
  const { data: balance = 0, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchHolderBalance(mint!, owner!, options),
    enabled,
    staleTime: 60_000,
  });
  return { isHolder: balance > 0, balance, loading: isLoading };
}
