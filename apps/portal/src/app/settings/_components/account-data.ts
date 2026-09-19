/**
 * Purpose: About rows and external links for the Account settings tab. Every row has a
 *          source: the portal build (lib/version.ts), the agent's health answer, or config.
 */

import { config } from '@/config';
import { APP_VERSION, BUILD_ID } from '@/lib/version';

export interface AboutRow {
  label: string;
  value: string;
  testId: string;
}

/** Network label from the configured cluster; the wallet and the launchpad use the same switch. */
export const NETWORK_LABEL = config.cluster === 'mainnet' ? 'Solana mainnet' : 'Solana devnet';

/**
 * @param agentVersion The agent version the controller reports (same source as the footer); empty while the agent is offline.
 */
export function aboutRows(agentVersion: string): AboutRow[] {
  return [
    { label: 'Portal', value: `v${APP_VERSION}`, testId: 'about-portal-version' },
    { label: 'Portal build', value: BUILD_ID, testId: 'about-portal-build' },
    { label: 'Agent', value: agentVersion ? `v${agentVersion.replace(/^v/, '')}` : '-', testId: 'about-agent-version' },
    { label: 'Network', value: NETWORK_LABEL, testId: 'about-network' },
  ];
}

export const ABOUT_LINKS: { label: string; href: string; testId: string }[] = [
  // GitHub links are omitted while NEXT_PUBLIC_GITHUB_URL is unset (no public org yet).
  ...(config.links.github ? [{ label: 'GitHub', href: config.links.github, testId: 'settings-link-github' }] : []),
  // Docs link is omitted while NEXT_PUBLIC_DOCS_ENABLED=false (docs host down).
  ...(config.features.docsEnabled ? [{ label: 'Documentation', href: config.links.docs, testId: 'settings-link-docs' }] : []),
  ...(config.links.issues ? [{ label: 'Report Issue', href: config.links.issues, testId: 'settings-link-issues' }] : []),
];
