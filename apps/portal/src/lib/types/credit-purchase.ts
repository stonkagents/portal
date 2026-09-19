/**
 * Purpose: Types for credit tier selection, purchase request/response, and purchase state machine
 */

/** A purchasable credit tier */
export interface CreditTier {
  id: 'starter' | 'pro' | 'ultra';
  credits: number;
  solPrice: number;
  label: string;
  popular?: boolean;
  /** Discount % vs base (Starter) rate — 0 for Starter, ~10 for Pro, ~25 for Ultra */
  discount?: number;
}

/** Modal state machine states */
export type PurchaseStatus = 'idle' | 'connecting' | 'signing' | 'confirming' | 'success' | 'error';
