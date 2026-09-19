/**
 * Purpose: Settings > Credits API key card. Reads the tracker API key the agent
 *          registered with (GET /api/v1/installer/peer-key, loopback only), shows it
 *          masked, and copies the real key after a confirm. Says so honestly when the
 *          agent has not registered yet or is too old to share it.
 */
'use client';

import { useState } from 'react';
import { Icon, Button, Modal } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { maskApiKey } from '@/lib/api/daemon-setup';
import { useInstallerPeerKey } from '@/lib/api/hooks/use-agent-settings';
import { useDaemon } from '@/providers/DaemonProvider';
import { FormField, SectionTitle, SettingsCard } from './shared';

export const API_KEY_COPY_CONFIRM = 'This key identifies your agent to the network. Copy it?';
export const API_KEY_MISSING = 'Your agent has not registered with the tracker yet, so it has no key to show.';
export const API_KEY_HELPER = 'Your agent stores this key and sends it with every tracker call. Only a masked version is shown here.';

export function ApiKeyCard() {
  const { connected } = useDaemon();
  const peerKey = useInstallerPeerKey();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const apiKey = connected ? (peerKey.data?.apiKey ?? null) : null;
  const display = !connected ? '-' : peerKey.isLoading ? 'Reading key...' : apiKey ? maskApiKey(apiKey) : '-';

  function copyKey() {
    if (!apiKey) return;
    void navigator.clipboard.writeText(apiKey);
    setConfirmOpen(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingsCard className="mb-0">
      <SectionTitle>API Key</SectionTitle>
      <FormField label="Your API Key" helper={API_KEY_HELPER}>
        <div
          className="flex items-center gap-2 bg-bg-tertiary border border-border-default rounded-lg px-3 py-2"
          data-testid="api-key-display"
        >
          <span className="text-sm font-mono text-text-primary flex-1 truncate" data-testid="api-key-masked">
            {display}
          </span>
          <button
            className="p-1 min-w-[44px] min-h-[36px] inline-flex items-center justify-center bg-transparent border-none text-text-secondary hover:text-accent-green cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setConfirmOpen(true)}
            disabled={!apiKey}
            title={apiKey ? 'Copy key' : undefined}
            aria-label="Copy API key"
            data-testid="api-key-copy"
          >
            <Icon name={copied ? 'check' : 'copy'} size="sm" />
          </button>
        </div>
      </FormField>
      {connected && peerKey.isFetched && !peerKey.isError && !apiKey && (
        <p className="text-xs text-accent-yellow" role="status" data-testid="api-key-missing">
          {API_KEY_MISSING}
        </p>
      )}
      {connected && peerKey.isError && (
        <p className="text-xs text-accent-red" role="alert" data-testid="api-key-error">
          Could not read the key from your agent. {peerKey.error.message}
        </p>
      )}
      <AgentRequiredNotice className="mt-2" data-testid="api-key-agent-required" />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Copy API key" maxWidth="max-w-md">
        <div className="flex flex-col gap-4" data-testid="api-key-confirm">
          <p className="text-sm text-text-secondary">{API_KEY_COPY_CONFIRM}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)} data-testid="api-key-confirm-cancel">
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="copy" onClick={copyKey} data-testid="api-key-confirm-copy">
              Copy key
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsCard>
  );
}
