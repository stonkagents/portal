/**
 * Purpose: Credit tier configuration — env-loaded SOL prices, custom amount calculator
 */
import type { CreditTier } from '@/lib/types';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// New 80%-margin tier sizes (Plan B). Base rate: 0.00002 SOL/credit at Starter,
// gliding down with discounts. Defaults assume SOL ~$86 — re-anchor in env vars
// (or the platform_settings credit_lamports_rate) as SOL drifts.
const STARTER_CREDITS = Number(process.env.NEXT_PUBLIC_CREDIT_TIER_STARTER_CREDITS ?? '1000');
const PRO_CREDITS = Number(process.env.NEXT_PUBLIC_CREDIT_TIER_PRO_CREDITS ?? '5000');
const ULTRA_CREDITS = Number(process.env.NEXT_PUBLIC_CREDIT_TIER_ULTRA_CREDITS ?? '20000');

const STARTER_SOL = Number(process.env.NEXT_PUBLIC_CREDIT_TIER_STARTER_SOL ?? '0.02');
const PRO_SOL = Number(process.env.NEXT_PUBLIC_CREDIT_TIER_PRO_SOL ?? '0.09');
const ULTRA_SOL = Number(process.env.NEXT_PUBLIC_CREDIT_TIER_ULTRA_SOL ?? '0.30');

/** Minimum custom purchase — must exceed the highest tier */
export const MIN_CUSTOM_CREDITS = ULTRA_CREDITS + 1;

/** Base rate (Starter tier) used to calculate discount percentages */
const BASE_RATE = STARTER_SOL / STARTER_CREDITS;

export const CREDIT_TIERS: CreditTier[] = [
  { id: 'starter', credits: STARTER_CREDITS, solPrice: STARTER_SOL, label: 'Starter', discount: 0 },
  {
    id: 'pro',
    credits: PRO_CREDITS,
    solPrice: PRO_SOL,
    label: 'Pro',
    popular: true,
    discount: Math.round((1 - PRO_SOL / PRO_CREDITS / BASE_RATE) * 100),
  },
  {
    id: 'ultra',
    credits: ULTRA_CREDITS,
    solPrice: ULTRA_SOL,
    label: 'Ultra',
    discount: Math.round((1 - ULTRA_SOL / ULTRA_CREDITS / BASE_RATE) * 100),
  },
];

/** SOL price for a custom credit amount — uses Ultra tier rate (best tier) */
export function calculateCustomSol(credits: number): number {
  if (credits <= 0) return 0;
  const ratePerCredit = ULTRA_SOL / ULTRA_CREDITS;
  return credits * ratePerCredit;
}

/** Convert SOL to lamports (integer) */
export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}
