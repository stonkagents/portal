/**
 * Purpose: The registrable domains the product is served from, primary first.
 *          Every public host lives on each of them (dev.<d>, tracker.dev.<d>,
 *          releases.<d>, docs.<d>). Kept apart from config so tests that mock
 *          `@/config` still see it.
 */

export const PRODUCT_DOMAINS = ['stonkagents.com'] as const;

/** The domain new links and defaults use; NEXT_PUBLIC_APP_DOMAIN overrides it per environment. */
export const PRIMARY_DOMAIN = PRODUCT_DOMAINS[0];
