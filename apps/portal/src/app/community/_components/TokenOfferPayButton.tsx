/**
 * Purpose: "Pay <amount> <symbol>" under a reply in a token-offer thread, for
 *          the post author. Greyed with the reason when the replier has no
 *          linked wallet, the offer is used up, this reply was paid, the
 *          author has no linked wallet, or the connected wallet is not the
 *          linked one; shows the step while a payment runs. When a transfer
 *          for the reply went on chain but was not recorded, the button
 *          gives way to the recovery row (Record payment, or paste a signature).
 */
'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { formatRawUnits } from '@/lib/utils/format';
import { payerWalletReason, type PayTokenOfferStatus } from '@/lib/api/hooks/use-pay-token-offer';
import type { PendingPayment } from '@/lib/board/pending-payments';
import type { Post, ThreadReply, TokenOfferDetails } from '@/lib/types/community';
import { TokenOfferRecovery } from './TokenOfferRecovery';

const STEP_LABEL: Partial<Record<PayTokenOfferStatus, string>> = {
  connecting: 'Connecting wallet...',
  signing: 'Confirm in your wallet...',
  confirming: 'Waiting for the chain...',
  verifying: 'Verifying on the network...',
};

export interface PayerWallet {
  /** The author's wallet as the network knows it: undefined while unknown, null when none is linked. */
  linked: string | null | undefined;
  /** The wallet connected in the portal, or null. */
  connected: string | null;
  /** GET /peers/me failed: the linked wallet cannot be confirmed, so nothing is paid. */
  unavailable?: boolean;
}

/** Why the button is greyed, or null when the reply can be paid. */
export function payDisabledReason(offer: TokenOfferDetails, reply: ThreadReply, payer: PayerWallet): string | null {
  if (reply.tokenOfferPaid) return 'This reply was already paid.';
  if (offer.max > 0 && offer.paid >= offer.max) return 'Every payment this offer allows has been made.';
  if (!reply.authorWallet) return 'The replier has not linked a wallet yet.';
  if (payer.unavailable) return 'Your agent could not confirm your linked wallet. Reload and try again.';
  return payerWalletReason(payer.linked, payer.connected);
}

interface TokenOfferPayButtonProps {
  post: Post & { tokenOffer: TokenOfferDetails };
  reply: ThreadReply;
  payer: PayerWallet;
  status: PayTokenOfferStatus;
  /** The reply a payment is running for; only its button shows the step. */
  activeReplyId: string | null;
  /** A transfer for this reply that went on chain but is not recorded yet. */
  pending: PendingPayment | null;
  onPay: (post: Post, reply: ThreadReply) => void;
  onRecord: (post: Post, reply: ThreadReply, signature: string) => void;
}

export function TokenOfferPayButton({ post, reply, payer, status, activeReplyId, pending, onPay, onRecord }: TokenOfferPayButtonProps) {
  const offer = post.tokenOffer;
  const running = activeReplyId === reply.id && STEP_LABEL[status] !== undefined;
  const busy = activeReplyId !== null && STEP_LABEL[status] !== undefined;

  const recovery = (
    <TokenOfferRecovery
      reply={reply}
      pending={pending}
      busy={busy}
      running={running ? (STEP_LABEL[status] ?? null) : null}
      onRecord={signature => onRecord(post, reply, signature)}
    />
  );

  /* A transfer went out for this reply: only recording is offered, never a second transfer. */
  if (pending) return recovery;

  const reason = payDisabledReason(offer, reply, payer);
  /* Nothing to record on a reply already paid or an offer used up; the network would refuse it anyway. */
  const recordable = !reply.tokenOfferPaid && !(offer.max > 0 && offer.paid >= offer.max);
  const label = running ? STEP_LABEL[status] : `Pay ${formatRawUnits(offer.amount, offer.decimals)} ${offer.symbol}`;
  return (
    <>
      <button
        type="button"
        data-testid={`pay-offer-${reply.id}`}
        disabled={reason !== null || busy}
        title={reason ?? undefined}
        aria-label={reason ? `${label}. ${reason}` : label}
        onClick={() => onPay(post, reply)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border cursor-pointer transition-colors',
          'border-accent-purple/30 bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-purple/10',
        )}
      >
        <Icon name={running ? 'loader' : 'coins'} size="sm" className={running ? 'animate-spin' : undefined} /> {label}
      </button>
      {recordable && recovery}
    </>
  );
}
