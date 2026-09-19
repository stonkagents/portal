/**
 * Purpose: On the dev deployment (devnet), send every connecting test wallet a little SOL
 *          and $STONK so it can launch and trade straight away. Asks the tracker once per
 *          wallet per browser per day; the tracker enforces the real cooldowns.
 *
 * Two gates. The first is decided at module level from `config`, so production and
 * mainnet trees export an inert component and never issue the request. The second is
 * the tracker's own word: `GET /api/launch/config` carries `devDripEnabled`, true only
 * when the tracker has a drip wallet (DEV_DRIP_SECRET_KEY). Without it the drip route
 * is not even registered, so asking would only ever 404. A missing field reads as
 * false, and a 404 from the drip itself is never surfaced: it is the same fact.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';
import { useWalletService } from '@/lib/wallet';
import { useToast } from '@/providers/ToastProvider';
import { useLaunchConfig } from '@/lib/launchlab/launch-config';
import { requestDevDrip, DevDripError, type DevDripResult } from '@/lib/api/dev-drip';
import { hasDrippedToday, markDrippedToday } from './dev-drip-storage';

/** True only on the dev deployment pointed at devnet. */
export const DEV_DRIP_ENABLED = config.isDevEnv && config.cluster === 'devnet';

/**
 * The tracker's drip flag, off until the launch config says otherwise. Read
 * loosely: the field is newer than the typed `LaunchConfig`, and an older
 * tracker that omits it has no drip either.
 */
export function readDevDripEnabled(launchConfig: unknown): boolean {
  return (launchConfig as { devDripEnabled?: unknown } | null | undefined)?.devDripEnabled === true;
}

export const DEV_DRIP_SENT = 'Test SOL and $STONK sent';
export const DEV_DRIP_SENT_SOL = 'Test SOL sent';
export const DEV_DRIP_SENT_STONK = 'Test $STONK sent';
export const DEV_DRIP_FAILED = 'Test tokens not sent';
export const DEV_DRIP_LINK = 'View on Solscan';
export const DEV_DRIP_RETRY = 'Try again';
/** What a failed drip means for the tester: without it the wallet cannot launch or trade here. */
export const DEV_DRIP_FAILED_HINT = 'Without test SOL this wallet cannot launch or trade on devnet.';

/** The error toast's description: the tracker's own sentence, then what it means here. */
export function dripFailureDescription(err: unknown): string {
  const reason = err instanceof Error && err.message ? err.message : 'Something went wrong.';
  if (err instanceof DevDripError && err.code === 'IP_LIMITED') return reason;
  return `${reason} ${DEV_DRIP_FAILED_HINT}`;
}

/** A refusal with a cooldown is final for the day; anything else may work on a second ask. */
export function dripRetryable(err: unknown): boolean {
  return !(err instanceof DevDripError && (err.code === 'ALREADY_DRIPPED' || err.code === 'IP_LIMITED'));
}

/** Query key prefix of `useHolderBalance`, invalidated so "You hold N $STONK" refreshes. */
const HOLDER_BALANCE_KEY = ['holder-balance'] as const;

export function dripTitle(result: DevDripResult): string {
  if (result.sentSol && result.sentStonk) return DEV_DRIP_SENT;
  return result.sentSol ? DEV_DRIP_SENT_SOL : DEV_DRIP_SENT_STONK;
}

export function dripDescription(result: DevDripResult): string {
  const legs: string[] = [];
  if (result.sentSol) legs.push(`${String(result.sol)} SOL`);
  if (result.sentStonk) legs.push(`${String(result.stonk)} $STONK`);
  return `${legs.join(' + ')} on devnet`;
}

function DevDripEffect() {
  const wallet = useWalletService();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  /* One attempt per wallet per mount, whatever the outcome; storage carries the day across reloads. */
  const attempted = useRef(new Set<string>());
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const { connected, publicKey } = wallet;
  /* Same query the launch form uses; React Query dedupes it, so this is free once the form has asked. */
  const { data: launchConfig } = useLaunchConfig();
  const dripEnabled = readDevDripEnabled(launchConfig);

  /* One ask, its outcome, and a "Try again" on the failures a second ask can fix. */
  const drip = useCallback(
    (wallet: string) => {
      requestDevDrip(wallet)
        .then(result => {
          markDrippedToday(wallet);
          if (!result.sentSol && !result.sentStonk) return;
          void queryClient.invalidateQueries({ queryKey: HOLDER_BALANCE_KEY });
          void walletRef.current.fetchBalance();
          addToast({
            title: dripTitle(result),
            description: dripDescription(result),
            variant: 'success',
            action: result.explorer ? { label: DEV_DRIP_LINK, href: result.explorer } : undefined,
          });
        })
        .catch((err: unknown) => {
          if (err instanceof DevDripError && err.code === 'ALREADY_DRIPPED') {
            markDrippedToday(wallet);
            return;
          }
          /* 404: the route is not registered on this tracker. Not an error the tester can act on; stay quiet. */
          if (err instanceof DevDripError && err.status === 404) return;
          addToast({
            title: DEV_DRIP_FAILED,
            description: dripFailureDescription(err),
            variant: 'error',
            ...(dripRetryable(err) ? { action: { label: DEV_DRIP_RETRY, onClick: () => drip(wallet) } } : {}),
          });
        });
    },
    [addToast, queryClient],
  );

  useEffect(() => {
    if (!dripEnabled || !connected || !publicKey) return;
    if (attempted.current.has(publicKey) || hasDrippedToday(publicKey)) return;
    attempted.current.add(publicKey);
    drip(publicKey);
  }, [dripEnabled, connected, publicKey, drip]);

  return null;
}

function DevDripDisabled() {
  return null;
}

/** Mount once in the layout shell; inert outside the dev deployment on devnet. */
export const DevDrip = DEV_DRIP_ENABLED ? DevDripEffect : DevDripDisabled;
