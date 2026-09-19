/**
 * App config – env-based and static config.
 * Use NEXT_PUBLIC_* for client-visible values.
 */

export const appConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'StonkAgents',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
  daemonUrl: process.env.NEXT_PUBLIC_DAEMON_URL ?? 'http://localhost:7841/api/v1',
  trackerUrl: process.env.NEXT_PUBLIC_TRACKER_URL ?? 'http://localhost:7842/api/v1',
  controllerUrl: process.env.NEXT_PUBLIC_CONTROLLER_URL ?? 'http://localhost:7840',
  /** Solana RPC URL. Default devnet for local; set to mainnet (or custom RPC) for production. */
  solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
  useRealDaemon: process.env.NEXT_PUBLIC_USE_REAL_DAEMON === 'true',
  isProduction: process.env.NODE_ENV === 'production',
  /** Release host (installer manifest and downloads); set per environment, primary domain by default. */
  downloadBaseUrl: process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL ?? 'https://releases.stonkagents.com',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
} as const;
