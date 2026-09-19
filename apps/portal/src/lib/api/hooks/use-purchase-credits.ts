/**
 * Purpose: React hook for credit purchase — drives the TopUpModal state machine.
 *          Flow: createIntent → build tx → Phantom sign → verify → cache invalidation
 */
'use client';

import { useState, useCallback } from 'react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useQueryClient } from '@tanstack/react-query';
import type { WalletService } from '@/lib/wallet/types';
import { submitViaWallet } from '@/lib/wallet/submit';
import type { CreditTier, PurchaseStatus } from '@/lib/types';
import { classifyPurchaseError } from '@/lib/credits/purchase';
import { solToLamports, calculateCustomSol } from '@/lib/credits/tiers';
import { purchaseApi } from '@/lib/api/daemon-credits';
import type { PurchaseVerifyResponse } from '@/lib/api/daemon-credits';
import { queryKeys } from '@/lib/api/keys';
import { getSolanaConnection } from '@/lib/solana/connection';
import { MEMO_PROGRAM_ID } from '@/lib/token-launch/constants';

interface UsePurchaseCreditsReturn {
  status: PurchaseStatus;
  error: string | null;
  result: PurchaseVerifyResponse | null;
  purchase: (tier: CreditTier | null, customCredits?: number) => Promise<void>;
  reset: () => void;
}

export function usePurchaseCredits(wallet: WalletService): UsePurchaseCreditsReturn {
  const qc = useQueryClient();
  const [status, setStatus] = useState<PurchaseStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseVerifyResponse | null>(null);

  const purchase = useCallback(
    async (tier: CreditTier | null, customCredits?: number) => {
      setError(null);
      setResult(null);

      try {
        // 1. Connect wallet if needed
        if (!wallet.connected) {
          setStatus('connecting');
          await wallet.connect();
        }

        if (!wallet.publicKey) {
          throw new Error('Wallet not connected');
        }

        // 2. Determine lamports from tier or custom amount
        const solAmount = tier ? tier.solPrice : calculateCustomSol(customCredits ?? 0);
        const lamports = solToLamports(solAmount);

        if (lamports <= 0) {
          throw new Error('Select a credit amount');
        }

        // 3. Pre-flight balance check — fail fast before prompting Phantom.
        //    Add ~0.00001 SOL headroom for the network fee on the transfer + memo tx.
        await wallet.fetchBalance();
        const balanceSol = wallet.balance ?? 0;
        const requiredSol = solAmount + 0.00001;
        if (balanceSol < requiredSol) {
          throw new Error(`Insufficient SOL balance. You have ${balanceSol.toFixed(4)} SOL but need ${requiredSol.toFixed(4)} SOL.`);
        }

        // 4. Create purchase intent — backend returns treasury address + memo
        setStatus('signing');
        const intent = await purchaseApi.createIntent(lamports);

        // 4. Build transaction: SOL transfer to treasury + memo instruction
        const userPubkey = new PublicKey(wallet.publicKey);
        const treasuryPubkey = new PublicKey(intent.treasury_address);

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: userPubkey,
            toPubkey: treasuryPubkey,
            lamports: intent.amount_lamports,
          }),
          new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(intent.memo),
          }),
        );

        const connection = await getSolanaConnection();
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = userPubkey;

        // 5. The wallet signs and sends in one step (signAndSendTransaction), so
        //    the wallet sees the whole flow. If its send throws for anything but a
        //    rejection, fall back to sign-only via the wallet and a send via our
        //    Alchemy RPC. The fallback avoids the RPC mismatch where Phantom sends
        //    through its own node, the pattern every flow used before.
        const signature = await submitViaWallet(wallet, tx, signed =>
          connection.sendRawTransaction(signed.serialize(), { skipPreflight: true }),
        );

        // 6. Wait for finalization, then verify with backend.
        //    We poll via HTTP instead of using connection.confirmTransaction because the latter
        //    opens a websocket subscription (signatureSubscribe), which Alchemy's standard tier
        //    rejects with -32601 "Method not found". HTTP getSignatureStatus is universally
        //    supported and ignores blockhash windows, so it stays authoritative even past the
        //    ~60–90s blockhash validity window.
        //
        //    Tracker's verify endpoint uses getTransaction(..., commitment: "finalized"), so we
        //    must wait for actual finalization here — accepting "confirmed" only would race
        //    verify and yield "transaction failed on-chain" from a not-yet-final tx.
        //
        //    Budget: 30 polls × 3s = 90s. Devnet finalization typically lands in 15–30s; the
        //    extra headroom covers congested slots without leaving the user staring forever.
        setStatus('confirming');
        let landedOnChain = false;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
          if (status.value?.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`);
          }
          if (status.value?.confirmationStatus === 'finalized') {
            landedOnChain = true;
            break;
          }
        }
        if (!landedOnChain) {
          // Tx hasn't reached finalized within the budget. It may still land later — surface
          // a recoverable error so the user can paste the signature into the recovery flow
          // (TODO: build /purchase/recover endpoint).
          throw new Error('Transaction did not finalize within 90 seconds. Please try the recovery flow.');
        }

        const verifyResult = await purchaseApi.verify(intent.intent_id, signature);

        setResult(verifyResult);
        setStatus('success');

        // 7. Invalidate credit caches so balance + transactions refresh
        qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
        qc.invalidateQueries({ queryKey: queryKeys.credits.transactions });
      } catch (err) {
        const message = classifyPurchaseError(err);
        setError(message);
        setStatus('error');
      }
    },
    [wallet, qc],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return { status, error, result, purchase, reset };
}
