/**
 * Purpose: Mounts the one FeedbackDialog (LayoutShell renders it beside the
 *          splash so it exists on every route) and binds it to the module-level
 *          open request, so `useFeedback().open()` / `openFeedback()` from any
 *          surface opens the same dialog.
 */
'use client';

import { useSyncExternalStore } from 'react';
import { FeedbackDialog } from './FeedbackDialog';
import { closeFeedback, getFeedbackRequest, subscribeFeedbackRequest } from './feedback-request';

const serverSnapshot = () => null;

export function FeedbackDialogHost() {
  const request = useSyncExternalStore(subscribeFeedbackRequest, getFeedbackRequest, serverSnapshot);
  return <FeedbackDialog open={request !== null} onClose={closeFeedback} prefill={request?.prefill} seq={request?.seq ?? 0} />;
}
