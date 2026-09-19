'use client';

import { useCallback } from 'react';
import type { FeedbackKind } from '@/lib/api/feedback';
import { openFeedback, type FeedbackPrefill } from './feedback-request';

/** `useFeedback().open()` opens the shared feedback dialog from any component. */
export function useFeedback() {
  const open = useCallback((kind?: FeedbackKind, prefill?: Omit<FeedbackPrefill, 'kind'>) => openFeedback(kind, prefill), []);
  return { open };
}
