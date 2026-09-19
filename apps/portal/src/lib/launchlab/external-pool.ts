/**
 * A LaunchLab pool that is not one of our launches.
 *
 * $AGENT is launched on stonk.fun: a Raydium LaunchLab pool under stonk.fun's
 * platform config, quoted in SOL. There is no tracker launch record and no
 * launch config for it, so nothing here is asked of the tracker. The pool
 * address is a PDA of the LaunchLab program, the base mint and the quote
 * mint (or given outright), and the platform config the trade instructions
 * must name is whatever the pool account says — `getPoolState` reads
 * `poolInfo.platformId` off chain and decodes that account, and the SDK's
 * buy/sell builders derive the platform vault from the same field. Our own
 * `LAUNCHPAD_PLATFORM_ID` never enters into it.
 *
 * The LaunchLab program itself is one per cluster; the SDK carries both ids.
 */

import { useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import { loadWeb3 } from '@/lib/solana/connection';
import { getPoolState, poolStateKey, POOL_POLL_MS, type LaunchPoolState } from './pool-state';

/** The LaunchLab program on the configured cluster, from the SDK. */
export async function launchlabProgramId(cluster: string = config.cluster): Promise<string> {
  const sdk = await import('@raydium-io/raydium-sdk-v2');
  return (cluster === 'mainnet' ? sdk.LAUNCHPAD_PROGRAM : sdk.DEV_LAUNCHPAD_PROGRAM).toBase58();
}

export interface ExternalPoolParams {
  mint: string;
  quoteMint: string;
  /** The pool address when known; derived from the mint pair otherwise. */
  poolId?: string | null;
}

/** The pool PDA for a mint pair on the configured cluster's LaunchLab program. */
export async function deriveExternalPoolId(mint: string, quoteMint: string): Promise<string> {
  const [sdk, { PublicKey }, programId] = await Promise.all([import('@raydium-io/raydium-sdk-v2'), loadWeb3(), launchlabProgramId()]);
  return sdk.getPdaLaunchpadPoolId(new PublicKey(programId), new PublicKey(mint), new PublicKey(quoteMint)).publicKey.toBase58();
}

/** The SDK's wording when the pool account is not on the cluster. Exported for tests. */
export const SDK_POOL_MISSING = 'fetch pool info error';

/**
 * What to say when there is no pool account: which address was read, how it
 * was found (named or derived from the pair), on which cluster, and which
 * environment values decide it. Exported for tests.
 */
export function poolMissingMessage(poolId: string, params: ExternalPoolParams, cluster: string = config.cluster): string {
  const found = params.poolId ? 'named by NEXT_PUBLIC_AGENT_POOL' : `derived from the mint and the quote ${params.quoteMint}`;
  return `No LaunchLab pool at ${poolId} on ${cluster} (${found}) for the mint ${params.mint}. Set NEXT_PUBLIC_AGENT_MINT, NEXT_PUBLIC_AGENT_POOL and NEXT_PUBLIC_AGENT_QUOTE_MINT to the live pool.`;
}

/**
 * Read a pool that is not one of ours. Everything about it, platform included,
 * comes off the pool account.
 *
 * @throws {Error} naming the environment variables when the mint is not an
 *   address (the built-in default is a display placeholder, not a key), or
 *   when the pool account does not exist on this cluster.
 */
export async function getExternalPoolState(params: ExternalPoolParams): Promise<LaunchPoolState> {
  const [{ PublicKey }, programId] = await Promise.all([loadWeb3(), launchlabProgramId()]);
  try {
    new PublicKey(params.mint);
  } catch {
    throw new Error(`${params.mint} is not a Solana address. Set NEXT_PUBLIC_AGENT_MINT to the token's mint.`);
  }
  try {
    return await getPoolState({ programId, mint: params.mint, quoteMint: params.quoteMint, poolId: params.poolId ?? undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith(SDK_POOL_MISSING)) throw error;
    const poolId = params.poolId ?? (await deriveExternalPoolId(params.mint, params.quoteMint));
    throw new Error(poolMissingMessage(poolId, params));
  }
}

/**
 * Live state of an external pool as React state. Same query key as
 * `usePoolState`, so a page that reads the pool both ways shares one read.
 */
export function useExternalPoolState(params: Partial<ExternalPoolParams> & { enabled?: boolean }) {
  const { mint, quoteMint, poolId, enabled = true } = params;
  const ready = Boolean(mint && quoteMint && enabled);
  return useQuery({
    queryKey: poolStateKey(mint ?? null, quoteMint ?? null),
    queryFn: () => getExternalPoolState({ mint: mint!, quoteMint: quoteMint!, poolId }),
    enabled: ready,
    staleTime: POOL_POLL_MS,
    retry: 3,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchInterval: query => (query.state.status === 'error' ? 15_000 : POOL_POLL_MS),
    refetchOnWindowFocus: false,
  });
}

/** True when the pool was created under a platform config other than `ourPlatformId`. Null until both are known. */
export function isForeignPlatform(pool: LaunchPoolState | null | undefined, ourPlatformId: string | null | undefined): boolean | null {
  if (!pool || !ourPlatformId) return null;
  return pool.platformId !== ourPlatformId;
}
