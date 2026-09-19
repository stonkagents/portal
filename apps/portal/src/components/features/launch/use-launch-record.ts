/**
 * The write-back of a live token to the tracker, and its retry.
 *
 * The chain is the record. A failed `POST /api/launch/record` must not undo a
 * live token, but it is shown for what it is: the record is idempotent on the
 * launch signature, so the same body can be re-sent from the success screen.
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { recordLaunch, type RecordLaunchPayload } from '@/lib/api/launches';
import { logErrorChain } from '@/lib/launchlab/errors';
import { classifyRecordFailure } from './record-failure';
import type { LaunchResult, RecordFailure } from './types';

/** How the first record attempt went, for the `LaunchResult` being built. */
export interface RecordOutcome {
  recorded: boolean;
  recordError: RecordFailure | null;
}

export function useLaunchRecord() {
  // The body of the last record sent, kept so a failed one can be re-sent as is.
  const body = useRef<RecordLaunchPayload | null>(null);
  const [retrying, setRetrying] = useState(false);

  /** Send the record once; a refusal is classified, never thrown. */
  const record = useCallback(async (payload: RecordLaunchPayload): Promise<RecordOutcome> => {
    body.current = payload;
    try {
      await recordLaunch(payload);
      return { recorded: true, recordError: null };
    } catch (err) {
      logErrorChain('launch/record', err);
      return { recorded: false, recordError: await classifyRecordFailure(err, 1) };
    }
  }, []);

  /**
   * Re-send the same body for `current` and return the result to show, or
   * null when there is nothing to retry (already recorded, or no body kept).
   */
  const retry = useCallback(async (current: LaunchResult): Promise<LaunchResult | null> => {
    const payload = body.current;
    if (!payload || current.recorded) return null;
    const attempts = (current.recordError?.kind === 'error' ? current.recordError.attempts : 0) + 1;
    setRetrying(true);
    try {
      await recordLaunch(payload);
      return { ...current, recorded: true, recordError: null };
    } catch (err) {
      logErrorChain('launch/record', err);
      return { ...current, recordError: await classifyRecordFailure(err, attempts) };
    } finally {
      setRetrying(false);
    }
  }, []);

  /** Forget the kept body; a new launch starts clean. */
  const reset = useCallback(() => {
    body.current = null;
  }, []);

  return useMemo(() => ({ record, retry, reset, retrying }), [record, retry, reset, retrying]);
}
