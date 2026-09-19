/**
 * Purpose: Normalize token holder counts for UI display.
 * Raw sources include the token contract account as a holder entry.
 */
export function toDisplayHolders(holders: number | null | undefined): number | null {
  if (holders == null) return null;
  return Math.max(0, holders - 1);
}
