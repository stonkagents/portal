/**
 * Purpose: UserProfile interface — persisted in localStorage to track user identity
 *          across sessions (returning user, launched token, daemon install history)
 */

import type { LaunchedToken } from '@/components/features/token-wizard';

/** Persisted in localStorage under key `stonkagents:user` */
export interface UserProfile {
  /** ISO date — when user first visited the portal */
  firstSeen: string;
  /** Incremented each browser session */
  visitCount: number;
  /** True after first successful daemon health check */
  hasInstalledDaemon: boolean;
  /** Token data if user has launched a token */
  launchedToken: LaunchedToken | null;
  /** Wallet address that launched the token */
  launchWalletAddress: string | null;
  /** Which socials the user has connected (e.g. ['twitter', 'telegram']) */
  connectedSocials: string[];
  /** True if user explicitly dismissed the "Launch a Token" nudge */
  tokenLaunchDismissed: boolean;
  /** ISO date — last visit */
  lastSeen: string;
}
