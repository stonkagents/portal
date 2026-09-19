/**
 * Raydium LaunchLab constants.
 *
 * Chain-level facts that are not settings. The curve shape (supply, tokens sold,
 * base decimals, migrate type) is NOT here: it arrives per launch in
 * `GET /api/launch/config` under `curve`, and the values below are only the
 * shapes we fall back to for a display estimate before that response lands.
 */

/** Total supply in raw units, as the standard curve sets it. Confirmed by `curve.supply`. */
export const SUPPLY_RAW = 1_000_000_000_000_000;

/** Raw units sold on the bonding curve, 79.31% of supply. Confirmed by `curve.totalSellA`. */
export const TOTAL_SELL_A_RAW = 793_100_000_000_000;

/** Solana rent for a launch, measured on live LaunchLab launches (0.012–0.016 SOL). */
export const LAUNCH_RENT_SOL = 0.015;

/** Largest transaction Solana accepts, in serialized bytes. */
export const MAX_TRANSACTION_BYTES = 1232;

/** Compute units requested for the launch transaction. */
export const LAUNCH_COMPUTE_UNITS = 600_000;

/** Default slippage for the bundled dev buy and for in-app trades, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 100;

/** Denominator LaunchLab uses for every rate it stores. */
export const RATE_DENOMINATOR = 10_000;

/** Ceiling on the Token-2022 transfer fee, in raw base units. Effectively uncapped. */
export const TRANSFER_FEE_MAX_RAW = '1000000000000000';

/** SPL Token program. */
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Token-2022 program. Every token we launch uses it, for the holders' transfer fee. */
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Wrapped SOL, used to price the launch fee. */
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Where the SOL for rent, the fee and gas comes from, said next to "this wallet
 * holds N SOL" so a first-time creator is not left with a disabled button. On
 * the devnet site the tracker drips test SOL once a day per wallet.
 */
export function solShortHint(cluster: string): string {
  return cluster === 'devnet'
    ? 'On this devnet site test SOL is sent once a day when your wallet connects; if it did not arrive, reload the page or use a Solana devnet faucet.'
    : 'Send SOL to this wallet from an exchange or another wallet, then come back.';
}
