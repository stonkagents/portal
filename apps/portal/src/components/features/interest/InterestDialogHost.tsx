/**
 * Purpose: Mounts the one InterestDialog (LayoutShell renders it beside the
 *          feedback host so it exists on every route) and binds it to the
 *          module-level open request, so `openInterest()` from any surface
 *          opens the same dialog.
 */
'use client';

import { useSyncExternalStore } from 'react';
import { InterestDialog } from './InterestDialog';
import { closeInterest, getInterestRequest, subscribeInterestRequest } from './interest-request';

const serverSnapshot = () => null;

export function InterestDialogHost() {
  const request = useSyncExternalStore(subscribeInterestRequest, getInterestRequest, serverSnapshot);
  return <InterestDialog open={request !== null} onClose={closeInterest} prefill={request?.prefill} seq={request?.seq ?? 0} />;
}
