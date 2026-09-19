/**
 * Purpose: Identity tab: Agent ID, display name (saved to the agent), the agent's public
 *          key (read from the identity endpoint, exportable), where the private key lives,
 *          and the Network section (tracker URL from setup status, bandwidth caps).
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { truncateAgentId } from '@/lib/utils/format';
import { readTrackerUrl } from '@/lib/api/daemon-setup';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { useSetupCheck } from '@/lib/api/hooks/use-agent-settings';
import { useDaemon } from '@/providers/DaemonProvider';
import { config } from '@/config';
import { FormField, SectionTitle, SettingsCard, READONLY_CLS, downloadBlob } from './shared';
import { DisplayNameField } from './DisplayNameField';
import { BandwidthSection } from './BandwidthSection';

/** Tracker shown when the agent has not reported the one it talks to: the configured one, never a guess. */
const TRACKER_URL_FALLBACK = config.api.trackerUrl;

/** Where the agent keeps its Ed25519 keypair; the portal never sees the private half. */
export const PRIVATE_KEY_NOTE = `Your private key never leaves your agent: it lives in ${config.paths.agentHome}/config.yaml on this machine. Back up that file to keep your identity.`;

export const IDENTITY_EXPORT_FILENAME = 'stonkagents-identity.json';

/** The public half of the identity as the export button writes it. */
export function identityExport(peerId: string, publicKey: string): string {
  return JSON.stringify({ peerId, publicKey }, null, 2);
}

export function IdentityTab() {
  const { health, connected } = useDaemon();
  const identity = useAgentIdentity();
  const tracker = useSetupCheck('tracker');
  const peerId = identity.data?.peerId || health.peerId;
  const publicKey = connected ? (identity.data?.publicKey ?? null) : null;
  const trackerUrl = (connected ? readTrackerUrl(tracker.check) : null) ?? TRACKER_URL_FALLBACK;
  const [copied, setCopied] = useState<string | null>(null);

  function handleCopy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div data-testid="settings-identity">
      {/* The page shows the offline notice; everything below reads from / writes to the agent: inert while it is offline */}
      <fieldset disabled={!connected} className={connected ? '' : 'opacity-60'} data-testid="settings-identity-form">
        {/* Identity Section */}
        <SettingsCard>
          <SectionTitle>Identity</SectionTitle>

          <FormField label="Agent ID">
            <div className="flex gap-2 items-center">
              <input className={READONLY_CLS} value={truncateAgentId(peerId)} readOnly data-testid="settings-peerid" />
              <Button
                variant="ghost"
                size="sm"
                icon={copied === 'agentId' ? 'check' : 'copy'}
                onClick={() => peerId && handleCopy(peerId, 'agentId')}
                data-testid="settings-peerid-copy"
              >
                {copied === 'agentId' ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </FormField>

          <DisplayNameField />

          {/* Only an agent that reports its public key gets the row; nothing is invented for older agents. */}
          {publicKey && (
            <FormField label="Ed25519 Public Key" helper="Base64. Safe to share: peers use it to verify what your agent signs.">
              <div className="flex gap-2 items-center">
                <input className={READONLY_CLS} value={publicKey} readOnly data-testid="settings-pubkey" />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={copied === 'pubkey' ? 'check' : 'copy'}
                  onClick={() => handleCopy(publicKey, 'pubkey')}
                  data-testid="settings-pubkey-copy"
                >
                  {copied === 'pubkey' ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="download"
                  onClick={() => downloadBlob(IDENTITY_EXPORT_FILENAME, identityExport(peerId, publicKey), 'application/json')}
                  data-testid="settings-pubkey-export"
                >
                  Export
                </Button>
              </div>
            </FormField>
          )}

          <p className="text-xs text-text-tertiary" data-testid="settings-private-key-note">
            {PRIVATE_KEY_NOTE}
          </p>
        </SettingsCard>

        {/* Network Section */}
        <SettingsCard className="mb-0">
          <SectionTitle>Network</SectionTitle>

          <FormField label="Tracker URL" helper="The tracker your agent registered with. Set in its config, not here.">
            <input className={READONLY_CLS + ' w-full'} value={trackerUrl} readOnly data-testid="settings-tracker-url" />
          </FormField>

          <BandwidthSection />
        </SettingsCard>
      </fieldset>
    </div>
  );
}
