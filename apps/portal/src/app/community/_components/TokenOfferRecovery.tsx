/**
 * Purpose: Recovery for a token offer payment whose transfer is on chain but
 *          not recorded (B-3). With a stored signature: "Payment sent, not yet
 *          recorded" and a Record payment button that only re-sends that
 *          signature. Without one: a folded "Already paid? Enter the
 *          transaction signature" input for a transfer made elsewhere. Neither
 *          path ever sends a transfer.
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { looksLikeSignature, type PendingPayment } from '@/lib/board/pending-payments';
import type { ThreadReply } from '@/lib/types/community';

interface TokenOfferRecoveryProps {
  reply: ThreadReply;
  pending: PendingPayment | null;
  /** Another payment is running; recording waits. */
  busy: boolean;
  /** The step label while this reply's record runs, else null. */
  running: string | null;
  onRecord: (signature: string) => void;
}

const SMALL_BUTTON =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded border bg-transparent cursor-pointer transition-colors disabled:opacity-50 font-mono';

export function TokenOfferRecovery({ reply, pending, busy, running, onRecord }: TokenOfferRecoveryProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [signature, setSignature] = useState('');
  const valid = looksLikeSignature(signature);

  const manual = (
    <div className="flex flex-col gap-1.5 mt-1.5" data-testid={`record-offer-${reply.id}-manual`}>
      <label className="text-[11px] text-text-tertiary" htmlFor={`record-offer-${reply.id}-signature`}>
        {pending ? 'Different signature?' : 'Already paid? Enter the transaction signature'}
      </label>
      <div className="flex gap-1.5 flex-wrap">
        <input
          id={`record-offer-${reply.id}-signature`}
          data-testid={`record-offer-${reply.id}-signature`}
          className="flex-1 min-w-[200px] min-h-[32px] px-2 bg-bg-tertiary border border-border-default rounded text-xs text-text-primary font-mono outline-none focus:border-accent-purple/50"
          placeholder="Transaction signature"
          value={signature}
          onChange={e => setSignature(e.target.value)}
          disabled={busy}
          spellCheck={false}
        />
        <button
          type="button"
          data-testid={`record-offer-${reply.id}-manual-send`}
          disabled={busy || !valid}
          onClick={() => onRecord(signature)}
          className={cn(SMALL_BUTTON, 'border-accent-purple/30 text-accent-purple hover:bg-accent-purple/10')}
        >
          Record
        </button>
      </div>
    </div>
  );

  if (!pending) {
    return (
      <div className="w-full" data-testid={`record-offer-${reply.id}`}>
        {!manualOpen ? (
          <button
            type="button"
            data-testid={`record-offer-${reply.id}-open`}
            onClick={() => setManualOpen(true)}
            className="text-[11px] text-text-tertiary underline bg-transparent border-none cursor-pointer p-0"
          >
            Already paid? Enter the transaction signature
          </button>
        ) : (
          manual
        )}
      </div>
    );
  }

  return (
    <div className="w-full p-2.5 bg-accent-yellow/5 border border-accent-yellow/25 rounded" data-testid={`record-offer-${reply.id}`}>
      <p className="text-xs text-accent-yellow font-bold inline-flex items-center gap-1">
        <Icon name="alert-triangle" size="sm" /> Payment sent, not yet recorded
      </p>
      <p className="text-[11px] text-text-tertiary mt-0.5 mb-1.5 break-all">
        The transfer is on chain (signature {pending.signature.slice(0, 8)}...{pending.signature.slice(-6)}). Record it so the reply counts as paid; do not pay again.
      </p>
      <button
        type="button"
        data-testid={`record-offer-${reply.id}-send`}
        disabled={busy}
        onClick={() => onRecord(pending.signature)}
        className={cn(SMALL_BUTTON, 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow hover:bg-accent-yellow/20')}
      >
        <Icon name={running ? 'loader' : 'check'} size="sm" className={running ? 'animate-spin' : undefined} /> {running ?? 'Record payment'}
      </button>
      {!manualOpen ? (
        <button
          type="button"
          data-testid={`record-offer-${reply.id}-open`}
          onClick={() => setManualOpen(true)}
          className="ml-3 text-[11px] text-text-tertiary underline bg-transparent border-none cursor-pointer p-0"
        >
          Different signature?
        </button>
      ) : (
        manual
      )}
    </div>
  );
}
