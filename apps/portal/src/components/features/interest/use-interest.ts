'use client';

import { useCallback } from 'react';
import { openInterest, type InterestPrefill } from './interest-request';

/** `useInterest().open()` opens the shared roadmap interest dialog from any component. */
export function useInterest() {
  const open = useCallback((prefill?: InterestPrefill) => openInterest(prefill), []);
  return { open };
}
