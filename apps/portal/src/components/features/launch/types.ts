/**
 * Shapes the launch form hands out.
 *
 * The quote is the tracker's own `LaunchQuote` for $STONK, so whatever launched
 * a token can be re-read from the same `GET /api/launch/config` response that
 * built the transaction.
 */

import type { LaunchQuote } from '@/lib/launchlab/launch-config';

/**
 * Why `POST /api/launch/record` did not accept a live token.
 *
 * `exists`: the tracker holds another launch for this wallet (409
 * LAUNCH_EXISTS); the new token is on chain but will never be listed as this
 * wallet's agent. Anything else is retried with the same body — the record is
 * idempotent on the launch signature.
 */
export type RecordFailure =
  | { kind: 'exists'; mint: string; name: string | null; symbol: string | null }
  | {
      kind: 'error';
      /** The tracker's error code, when it answered at all. */
      code: string | null;
      message: string;
      /** True when the request never reached the tracker (no HTTP answer). */
      transient: boolean;
      /** False for a refusal the same body can never pass (e.g. QUOTE_NOT_ALLOWED): no retry is offered. */
      retryable: boolean;
      /** How many times the record has been sent, the first try included. */
      attempts: number;
    };

/** What a finished launch gives the rest of the flow. */
export type LaunchResult = {
  mint: string;
  poolId: string;
  txSignature: string;
  name: string;
  symbol: string;
  imageUrl: string;
  /** The pinned 128 px copy of the image, or null when none was made. */
  imageThumbUrl: string | null;
  /** Permanent metadata document the mint points at. */
  metadataUri: string;
  quote: LaunchQuote;
  quoteSymbol: string;
  /** Token-2022 transfer tax baked into the mint, in basis points. */
  holderTaxBps: number;
  /** The creator's first buy, in whole quote tokens. */
  devBuy: number;
  /** Launch fee paid to the treasury, in lamports. */
  feeLamports: number;
  /** LaunchLab program the curve lives on. */
  programId: string;
  /** True once `POST /api/launch/record` accepted the launch. */
  recorded: boolean;
  /** Why it was not recorded; absent once it is, and on the mock path. */
  recordError?: RecordFailure | null;
  /** True when no chain was touched (`NEXT_PUBLIC_USE_REAL_WALLET` off). */
  mock: boolean;
};

export interface LaunchFormValues {
  name: string;
  symbol: string;
  description: string;
  /** The 512 px master the metadata will point at. */
  imageDataUrl: string | null;
  /** The 128 px thumb drawn from the same master; null until the painter has run. */
  thumbnailDataUrl: string | null;
  website: string;
  twitter: string;
  telegram: string;
  /** 'percent' drives the buy off supply, 'amount' off the quote asset. */
  devBuyMode: 'percent' | 'amount';
  devBuyPercent: number;
  devBuyQuoteAmount: number;
}

export type LaunchPhase = 'form' | 'uploading' | 'signing' | 'confirming' | 'recording' | 'success';
