/**
 * Shapes the launch modal shares with the home page and the user profile.
 *
 * `LaunchedToken` is what the rest of the portal stores about a launch (the
 * profile, the peer-token hook, Step 2 of the home flow). Its first five fields
 * predate the launchpad and stay as they are; the rest are optional additions
 * a LaunchLab launch fills in.
 */

export interface LaunchedToken {
  name: string;
  ticker: string;
  imageDataUrl: string | null;
  contractAddr: string;
  imageUrl?: string;
  /** The pinned 128 px copy of imageUrl, when the launch made one. */
  imageThumbUrl?: string;
  /** LaunchLab pool the token trades on. */
  poolId?: string;
  quoteMint?: string;
  quoteSymbol?: string;
  txSignature?: string;
  metadataUri?: string;
}

/** Legacy form shape, kept for `src/lib/token-launch/token-form-schema.ts`. */
export interface TokenFormData {
  name: string;
  ticker: string;
  description: string;
  imageDataUrl: string | null;
  twitter: string;
  telegram: string;
  website: string;
  /** Initial buy as typed, for input binding. */
  initialBuySol: string;
}

export const INITIAL_FORM: TokenFormData = {
  name: '',
  ticker: '',
  description: '',
  imageDataUrl: null,
  twitter: '',
  telegram: '',
  website: '',
  initialBuySol: '',
};
