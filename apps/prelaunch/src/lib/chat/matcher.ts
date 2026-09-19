/**
 * Purpose: Pattern matcher — finds best response from the response bank.
 *          Simple keyword matching, no NLP, no backend. Fast and deterministic.
 */

import { RESPONSE_BANK, FALLBACK_RESPONSES } from '@/lib/chat/responses';

/**
 * Match user input against keyword patterns and return a random response from the pool.
 * First match wins — response bank is ordered by specificity.
 */
export function matchResponse(input: string): string {
  const normalized = input.toLowerCase().trim();

  for (const entry of RESPONSE_BANK) {
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword)) {
        return pickRandom(entry.responses);
      }
    }
  }

  return pickRandom(FALLBACK_RESPONSES);
}

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}
