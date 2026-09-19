/**
 * Purpose: WebMCP tool — returns the platform's installer (manifest-backed, Windows
 *          only today), trust signals, and uninstall steps. No guessed URLs.
 *
 * The installer is Step 2 of the product. It is only handed out for a wallet
 * that has launched a token on the launchpad (the tracker's `by-wallet` answer
 * is the proof). Without a wallet, or for a wallet with no launch, the answer
 * carries no URL and says where to start.
 */

import type { WebMCPToolDefinition } from '../types';
import { fetchLaunchesByWallet } from '@/lib/api/launches';
import {
  ACCESS_BLOCK,
  getInstallerInfo,
  LAUNCHPAD_URL,
  TRUST_INFO,
  UNINSTALL_INFO,
  type InstallerInfo,
  type InstallerPlatform,
} from '../constants';

function detectPlatform(): InstallerPlatform {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'macOS';
}

const INSTALL_STEPS: Record<InstallerPlatform, string[]> = {
  windows: [
    'Download the .exe from the link above',
    'Run the installer. Windows SmartScreen will confirm it is signed',
    'StonkAgents installs and your agent starts automatically',
    'Your Agent ID is generated on first launch',
  ],
  macOS: ['The macOS installer is coming soon. Open the portal on a Windows machine to run your agent today.'],
  linux: ['There is no Linux installer. Open the portal on a Windows machine to run your agent today.'],
};

/** Why the installer is not in the answer. */
type LockReason = 'no_wallet' | 'no_launch' | 'tracker_unreachable';

const LOCK_MESSAGES: Record<LockReason, string> = {
  no_wallet:
    'The installer is only handed out to a wallet that has launched a token. Pass the wallet address that launched, or launch one on the launchpad first.',
  no_launch: 'This wallet has not launched a token yet. Launch one on the launchpad first; the installer unlocks right after.',
  tracker_unreachable: 'Could not confirm a launch for this wallet right now. Try again in a moment.',
};

/** Proof of Step 1: the tracker lists at least one launch for the wallet. */
async function lockReasonFor(wallet: string | null): Promise<LockReason | null> {
  if (!wallet) return 'no_wallet';
  try {
    const launches = await fetchLaunchesByWallet(wallet);
    return launches.length > 0 ? null : 'no_launch';
  } catch {
    return 'tracker_unreachable';
  }
}

function lockedInstaller(platform: InstallerPlatform): InstallerInfo {
  return { platform, status: 'locked', format: null, download_url: null, version: null };
}

export const getInstallerTool: WebMCPToolDefinition = {
  name: 'getInstaller',
  description:
    'Get the StonkAgents installer download link, trust verification details, ' +
    'and step-by-step installation instructions for your operating system. ' +
    'The installer is only handed out to a wallet that has launched a token on the launchpad; ' +
    'pass that wallet address. ' +
    'The Windows installer is Authenticode-signed; macOS is coming soon.',
  inputSchema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        description: 'Target operating system. Auto-detected if omitted.',
        enum: ['macOS', 'windows', 'linux'],
      },
      wallet: {
        type: 'string',
        description: 'The Solana wallet address that launched a token on the launchpad. Without it no download link is returned.',
      },
    },
  },
  execute: async params => {
    const platform = (params.platform as InstallerPlatform | undefined) ?? detectPlatform();
    const wallet = typeof params.wallet === 'string' && params.wallet.trim() !== '' ? params.wallet.trim() : null;

    const lockReason = await lockReasonFor(wallet);
    if (lockReason) {
      return {
        installer: lockedInstaller(platform),
        launch_required: {
          reason: lockReason,
          message: LOCK_MESSAGES[lockReason],
          launchpad_url: LAUNCHPAD_URL,
        },
        install_steps: ['Launch a token on the launchpad', 'Call getInstaller again with the wallet that launched it'],
        trust: {
          company: TRUST_INFO.company,
          code_signing: TRUST_INFO.code_signing,
          privacy: TRUST_INFO.privacy,
        },
        access: ACCESS_BLOCK,
      };
    }

    const info = await getInstallerInfo();
    const installer = info[platform] ?? info.windows;

    return {
      installer,
      trust: {
        company: TRUST_INFO.company,
        code_signing: TRUST_INFO.code_signing,
        privacy: TRUST_INFO.privacy,
      },
      safety_analysis: TRUST_INFO.safety_analysis,
      performance_slos: TRUST_INFO.performance_slos,
      install_steps: INSTALL_STEPS[installer.platform],
      post_install: {
        what_happens: 'Your agent starts automatically, generates your Agent ID, and connects to the P2P network',
        first_sync_time: 'Usually under 30 seconds',
      },
      uninstall: installer.platform === 'windows' ? { windows: UNINSTALL_INFO.windows } : {},
      access: ACCESS_BLOCK,
    };
  },
};
