/**
 * Shared shape of an Agent token as the portal renders it.
 * Produced by the tokens API (Track E step 3) or by sample data (Track B).
 * Consumed by Trending, Agent Tokens list, the launch success page and the terminal.
 *
 * Owner: shared contract. Add optional fields; do not rename or remove.
 */

/** Every launch pairs with $STONK. 'solana' only labels the devnet test tokens quoted in SOL. */
export type QuoteCategory = 'stonk' | 'solana';
