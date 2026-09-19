/**
 * Purpose: Pay a reply on a token-offer post (phase 1, section 3): connect the
 *          wallet if needed, build the SPL transfer to the replier's linked
 *          wallet, sign and send through the wallet, wait for finality, then
 *          hand the signature to the network
 *          (POST /board/posts/{id}/token-offer/pay `{ reply_id, signature }`),
 *          which verifies the transfer on chain and counts the payment.
 *
 *          Tokens never vanish: the signature is stored per post and reply
 *          the moment the wallet returns it, so if the record call fails
 *          (proxy timeout, restart, reload) the thread offers "Record
 *          payment" with that signature, or takes one pasted by hand, and a
 *          second transfer is never sent. No transfer is sent at all unless
 *          the network knows the payer's linked wallet and it is the one
 *          connected.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { ApiRequestError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { transformPost } from '@/lib/api/transformers/community';
import {
  clearPendingPayment,
  isFinalTxInvalidReason,
  readPendingPayments,
  savePendingPayment,
  type PendingPayment,
} from '@/lib/board/pending-payments';
import { buildTokenOfferTransferTx, waitForFinalized } from '@/lib/board/token-offer-pay';
import { classifyPurchaseError } from '@/lib/credits/purchase';
import { isUserRejection } from '@/lib/launchlab/errors';
import { getSolanaConnection } from '@/lib/solana/connection';
import { submitViaWallet } from '@/lib/wallet/submit';
import { abbreviateAddress, type WalletService } from '@/lib/wallet/types';
import { useToast } from '@/providers/ToastProvider';
import type { Post, ThreadReply } from '@/lib/types/community';
import type { PortalTokenOfferPayResponse } from '@/lib/types/backend';

export type PayTokenOfferStatus = 'idle' | 'connecting' | 'signing' | 'confirming' | 'verifying' | 'success' | 'error';

/** The network's refusals for a payment, in our words. */
const PAY_MESSAGES: Readonly<Record<string, string>> = {
  TOKEN_OFFER_NO_WALLET: 'This replier has not linked a wallet yet, so there is nowhere to send the tokens.',
  TOKEN_OFFER_EXHAUSTED: 'Every payment this offer allows has been made.',
  TOKEN_OFFER_ALREADY_PAID: 'This reply was already paid.',
  TOKEN_OFFER_OWN_REPLY: 'You cannot pay your own reply.',
  TOKEN_OFFER_NONE: 'This post has no token offer.',
  TOKEN_OFFER_NOT_AUTHOR: 'Only the post author can pay.',
  NOT_FOUND: 'That reply is no longer in this thread.',
};

export const LINK_WALLET_FIRST = 'Link a wallet in Settings before paying.';

/** Why the connected wallet may not pay, or null when it may. */
export function payerWalletReason(linkedWallet: string | null | undefined, connectedWallet: string | null): string | null {
  if (linkedWallet === undefined) return 'Checking your linked wallet...';
  if (linkedWallet === null) return LINK_WALLET_FIRST;
  if (connectedWallet && connectedWallet !== linkedWallet) {
    return `Connect the wallet linked to this agent: ${abbreviateAddress(linkedWallet)}`;
  }
  return null;
}

/** What the network's refusal means to the person paying; TX_INVALID carries its own reason and is shown as is. */
export function payErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return PAY_MESSAGES[err.code] ?? err.message;
  if (isUserRejection(err)) return 'You rejected the transfer in your wallet.';
  return classifyPurchaseError(err).replace('Purchase failed', 'Payment failed');
}

/** Once the transfer is out, a failure is about the record, never an invitation to pay again. */
function afterTransferMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return payErrorMessage(err);
  if (err instanceof Error && /finaliz/i.test(err.message)) return err.message;
  return 'The record did not reach the network.';
}

const RECORD_RETRY_NOTE ='The transfer is on chain. Use Record payment to try the record again; do not pay twice.';

export interface PayTokenOfferInput {
  post: Post;
  reply: ThreadReply;
}

export interface UsePayTokenOfferReturn {
  status: PayTokenOfferStatus;
  /** The reply being paid right now, so only its button shows the progress. */
  replyId: string | null;
  error: string | null;
  /** Transfers sent but not yet recorded, by reply id. */
  pending: Record<string, PendingPayment>;
  pay: (input: PayTokenOfferInput) => Promise<void>;
  /** Record a transfer that already went on chain (stored or pasted signature); never sends one. */
  record: (input: PayTokenOfferInput & { signature: string }) => Promise<void>;
  reset: () => void;
}

/**
 * `linkedWallet` is the payer's wallet as the network knows it (GET /peers/me):
 * undefined while unknown, null when none is linked. Nothing is signed unless
 * it is known and equals the connected wallet.
 */
export function usePayTokenOffer(wallet: WalletService, linkedWallet: string | null | undefined, postId: string | null): UsePayTokenOfferReturn {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [status, setStatus] = useState<PayTokenOfferStatus>('idle');
  const [replyId, setReplyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PendingPayment>>({});

  useEffect(() => {
    setPending(postId ? readPendingPayments(postId) : {});
  }, [postId]);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      setStatus('error');
      addToast({ title: 'Payment not completed', description: message, variant: 'error' });
    },
    [addToast],
  );

  /** POST the signature; on success or a final refusal the pending entry goes; otherwise it stays for another try. */
  const submitRecord = useCallback(
    async (post: Post, reply: ThreadReply, signature: string) => {
      setStatus('verifying');
      try {
        const answer = await daemonFetch<PortalTokenOfferPayResponse>(`/board/posts/${post.id}/token-offer/pay`, {
          method: 'POST',
          body: JSON.stringify({ reply_id: reply.id, signature }),
        });
        const updated = answer && typeof answer === 'object' && 'post' in answer ? answer.post : answer;
        if (updated && typeof updated === 'object' && 'id' in updated) {
          qc.setQueryData([...queryKeys.board.post(post.id), 'via-agent'], transformPost(updated));
        }
        clearPendingPayment(post.id, reply.id);
        setPending(p => {
          const next = { ...p };
          delete next[reply.id];
          return next;
        });
        qc.invalidateQueries({ queryKey: queryKeys.board.post(post.id) });
        qc.invalidateQueries({ queryKey: queryKeys.board.posts });
        setStatus('success');
        const symbol = post.tokenOffer?.symbol;
        addToast({
          title: 'Offer paid',
          description: symbol ? `The network verified the ${symbol} transfer.` : 'The network verified the transfer.',
          variant: 'success',
        });
      } catch (err) {
        const final =
          err instanceof ApiRequestError &&
          (err.code === 'TOKEN_OFFER_ALREADY_PAID' || (err.code === 'TOKEN_OFFER_TX_INVALID' && isFinalTxInvalidReason(err.message)));
        if (final) {
          clearPendingPayment(post.id, reply.id);
          setPending(p => {
            const next = { ...p };
            delete next[reply.id];
            return next;
          });
          fail(payErrorMessage(err));
          return;
        }
        fail(`${afterTransferMessage(err)} ${RECORD_RETRY_NOTE}`);
      }
    },
    [qc, addToast, fail],
  );

  const pay = useCallback(
    async ({ post, reply }: PayTokenOfferInput) => {
      const offer = post.tokenOffer;
      setError(null);
      setReplyId(reply.id);
      if (!offer || !offer.mint) return fail(PAY_MESSAGES.TOKEN_OFFER_NONE);
      if (!reply.authorWallet) return fail(PAY_MESSAGES.TOKEN_OFFER_NO_WALLET);
      if (pending[reply.id]) return fail(`A transfer for this reply was already sent. ${RECORD_RETRY_NOTE}`);
      const preflight = payerWalletReason(linkedWallet, wallet.connected ? wallet.publicKey : null);
      if (preflight) return fail(preflight);

      let signature: string | null = null;
      try {
        if (!wallet.connected) {
          setStatus('connecting');
          const ok = await wallet.connect();
          if (!ok) throw new Error('Connect a wallet to pay the offer.');
        }
        const from = wallet.publicKey;
        if (!from) throw new Error('Wallet not connected');
        const mismatch = payerWalletReason(linkedWallet, from);
        if (mismatch) throw new Error(mismatch);

        setStatus('signing');
        const connection = await getSolanaConnection();
        const tx = await buildTokenOfferTransferTx(connection, {
          postId: post.id,
          replyId: reply.id,
          mint: offer.mint,
          amountRaw: offer.amount,
          from,
          to: reply.authorWallet,
        });
        signature = await submitViaWallet(wallet, tx, signed =>
          connection.sendRawTransaction(signed.serialize(), { skipPreflight: true }),
        );
        /* From here on the tokens may move; the signature outlives this page. */
        savePendingPayment(post.id, reply.id, signature);
        setPending(p => ({ ...p, [reply.id]: { signature: signature as string, at: new Date().toISOString() } }));

        setStatus('confirming');
        await waitForFinalized(connection, signature);
      } catch (err) {
        fail(signature ? `${afterTransferMessage(err)} ${RECORD_RETRY_NOTE}` : payErrorMessage(err));
        return;
      }
      await submitRecord(post, reply, signature);
    },
    [wallet, linkedWallet, pending, fail, submitRecord],
  );

  const record = useCallback(
    async ({ post, reply, signature }: PayTokenOfferInput & { signature: string }) => {
      setError(null);
      setReplyId(reply.id);
      await submitRecord(post, reply, signature.trim());
    },
    [submitRecord],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setReplyId(null);
    setError(null);
  }, []);

  return { status, replyId, error, pending, pay, record, reset };
}
