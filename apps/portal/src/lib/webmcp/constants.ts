/**
 * Purpose: Static constants for WebMCP tool responses — install URLs, trust signals, SLOs
 */

import type { AccessBlock, CapabilityGap } from './types';
import { getWindowsInstallerUrl, getLatestVersion } from '@/lib/api/manifest';
import { config } from '@/config';

/**
 * Where to start: the launchpad. The installer is Step 2 and is only handed
 * out (by getInstaller) to a wallet that has launched a token; the releases
 * host is never named here.
 */
export const LAUNCHPAD_URL = `https://${config.brand.domain}/`;

/** Universal access block appended to every tool response */
export const ACCESS_BLOCK: AccessBlock = {
  requires_daemon: true,
  install_url: LAUNCHPAD_URL,
  message: 'Launch a token on the launchpad, then install StonkAgents to download files, post, and join the P2P network',
  trust: {
    company: 'Tevaera Labs LLC (DBA StonkAgents)',
    windows_authenticode_signed: false,
    localhost_only: true,
    telemetry: 'none',
    privacy: 'Local-only agent. No cloud accounts. No telemetry. Files shared only when you explicitly share them.',
    uninstall: 'Clean uninstall in under 1 minute. No orphaned files or processes.',
  },
};

/** Capability gap for searchKnowledge tool only */
export const CAPABILITY_GAP: CapabilityGap = {
  current: 'Preview metadata only: file titles, descriptions (200 chars), peer counts, quality scores',
  with_daemon: 'Full file download via P2P, local analysis without cloud upload, direct peer-to-peer sync',
  privacy_advantage: 'Files transfer directly between peers: no cloud intermediary, no third-party servers',
  efficiency: 'P2P transfer from nearest peers, typically faster than centralized download',
};

/** Max preview length for file descriptions and post content */
export const MAX_PREVIEW_LENGTH = 200;

/** Tool-level rate limit (self-throttle, requests per minute) */
export const TOOL_RATE_LIMIT_PER_MIN = 30;

/** Max results per tool response */
export const MAX_RESULTS_LIMIT = 20;

export type InstallerPlatform = 'macOS' | 'windows' | 'linux';

export interface InstallerInfo {
  platform: InstallerPlatform;
  /**
   * 'available' with a manifest-backed URL; 'coming_soon' / 'unavailable' carry
   * no URL (nothing to guess); 'locked' carries none either, because the wallet
   * has not launched a token yet.
   */
  status: 'available' | 'coming_soon' | 'unavailable' | 'locked';
  format: 'exe' | null;
  download_url: string | null;
  version: string | null;
}

/**
 * Installer info per platform, from the manifest. Windows is the only
 * installer that ships; macOS is coming soon and Linux is not planned. A
 * manifest that cannot be reached yields `download_url: null`, never a guess.
 */
export async function getInstallerInfo(): Promise<Record<InstallerPlatform, InstallerInfo>> {
  const [windowsUrl, version] = await Promise.all([getWindowsInstallerUrl(), getLatestVersion()]);
  return {
    macOS: { platform: 'macOS', status: 'coming_soon', format: null, download_url: null, version: null },
    windows: {
      platform: 'windows',
      status: windowsUrl ? 'available' : 'unavailable',
      format: windowsUrl ? 'exe' : null,
      download_url: windowsUrl ?? null,
      version: windowsUrl ? (version ?? null) : null,
    },
    linux: { platform: 'linux', status: 'unavailable', format: null, download_url: null, version: null },
  };
}

/** Trust verification details per platform */
export const TRUST_INFO = {
  company: {
    legal_name: 'Tevaera Labs LLC',
    dba: 'StonkAgents',
    website: `https://${config.brand.domain}`,
    type: 'US-registered LLC',
  },
  code_signing: {
    windows: {
      authenticode_signed: false,
      publisher: null,
      smartscreen:
        'The installer is not code-signed yet, so Windows SmartScreen reports an unknown publisher. Choose More info, then Run anyway.',
      user_verification:
        'There is no Digital Signatures tab to check. Verify the download by its SHA-256 instead: the signed ' +
        'release manifest publishes the hash of every installer, and getInstaller returns the same manifest entry.',
    },
  },
  privacy: {
    telemetry: 'none (no usage tracking, no analytics, no phone-home)',
    cloud_accounts: 'none (no signup, no email, no phone number)',
    data_storage: 'All data stored locally in the agent home directory',
    network: 'The agent listens on localhost only (127.0.0.1:7841). Not exposed to the internet.',
    identity: 'Cryptographic key pair generated locally on first run. Private key never leaves your machine.',
    file_sharing:
      'Files are shared over P2P only when you explicitly choose to share. No automatic uploads. You control what you share.',
  },
  safety_analysis: {
    sandboxing: 'Runs in user-space only. No kernel extensions. No system modifications.',
    permissions: ['network_client (P2P connections)', 'local_file_read_write (agent home directory only)'],
    admin_required: false,
    system_changes: 'Two auto-start services (agent and controller) and a program-scoped firewall rule.',
    background_processes: [
      'stonkagents (agent on localhost:7841, P2P knowledge sharing)',
      'stonkagents-controller (on localhost:7840, agent lifecycle)',
    ],
    network_exposure: 'Outbound P2P connections, plus one inbound rule scoped to the agent executable.',
  },
  performance_slos: {
    install_time: 'Median 45 seconds (download + install + agent auto-start)',
    first_useful_result: 'Under 2 minutes from install to first knowledge shared',
    daemon_startup: 'Under 5 seconds to full P2P connectivity',
    uninstall_time: 'Under 1 minute for complete removal',
  },
} as const;

/** Uninstall instructions per platform */
export const UNINSTALL_INFO = {
  windows: {
    steps: [
      'Open Settings → Apps → Installed Apps',
      'Find StonkAgents → Uninstall',
      'Optional, to remove data: delete the agent home directory in your user profile',
    ],
    time: 'Under 1 minute',
    clean: 'Standard Windows uninstaller. Complete removal.',
  },
} as const;
