/**
 * Purpose: Security tab: what the agent always verifies (one line), and the real blocked
 *          list from the agent with per-row Unblock and an Add input.
 */
'use client';

import { useState } from 'react';
import { Button, EmptyState } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { useBlockedPeers, useBlockPeer, useUnblockPeer } from '@/lib/api/hooks/use-peers';
import { truncateAgentId } from '@/lib/utils/format';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { FormField, SectionTitle, SettingsCard, INPUT_CLS } from './shared';

export const VERIFICATION_NOTE =
  'Every file your agent downloads is checked against its content hash (CID) before it is stored or shared on. This is always on.';
export const PEER_ID_INVALID =
  'That does not look like an Agent ID. They are base58 strings such as 12D3KooW... or Qm... (46 to 64 characters).';

/**
 * A libp2p peer id as the network prints it: base58btc (no 0, O, I, l), 46 chars
 * for a legacy Qm multihash, 52 for an Ed25519 12D3KooW id. Length is kept loose
 * so a new key type is not refused here; the agent has the final say.
 */
const PEER_ID_RE = /^(12D3KooW|Qm)[1-9A-HJ-NP-Za-km-z]{40,60}$/;

export function looksLikePeerId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 46 && trimmed.length <= 64 && PEER_ID_RE.test(trimmed);
}

export function SecurityTab() {
  const { connected, health } = useDaemon();
  const { addToast } = useToast();
  const blocked = useBlockedPeers();
  const block = useBlockPeer();
  const unblock = useUnblockPeer();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const ids = connected ? (blocked.data?.peer_ids ?? []) : [];
  const trimmed = draft.trim();
  const canAdd = connected && trimmed !== '' && !block.isPending;

  function handleAdd() {
    if (!canAdd) return;
    if (!looksLikePeerId(trimmed) || trimmed === health.peerId) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    block.mutate(trimmed, {
      onSuccess: () => {
        setDraft('');
        addToast({ title: 'Agent blocked', description: truncateAgentId(trimmed), variant: 'success' });
      },
      onError: error => addToast({ title: 'Could not block that agent', description: error.message, variant: 'error' }),
    });
  }

  function handleUnblock(id: string) {
    unblock.mutate(id, {
      onSuccess: () => addToast({ title: 'Agent unblocked', description: truncateAgentId(id), variant: 'success' }),
      onError: error => addToast({ title: 'Could not unblock that agent', description: error.message, variant: 'error' }),
    });
  }

  return (
    <div data-testid="settings-security">
      {/* File Verification */}
      <SettingsCard>
        <SectionTitle>File Verification</SectionTitle>
        <p className="text-xs text-text-secondary" data-testid="settings-verification-note">
          {VERIFICATION_NOTE}
        </p>
      </SettingsCard>

      {/* Blocked Peers */}
      <SettingsCard className="mb-0">
        <SectionTitle>Blocked Agents</SectionTitle>
        <FormField label="Block an Agent" helper="Blocked agents cannot connect to your agent or see your shared assets.">
          <div className="flex gap-2 items-center">
            <input
              className={INPUT_CLS}
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                if (invalid) setInvalid(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={connected ? 'Agent ID, e.g. 12D3KooW...' : 'Agent offline'}
              disabled={!connected}
              aria-invalid={invalid || undefined}
              aria-label="Agent ID to block"
              data-testid="settings-block-input"
            />
            <Button
              variant="danger"
              size="sm"
              icon="slash"
              onClick={handleAdd}
              disabled={!canAdd}
              loading={block.isPending}
              data-testid="settings-block-add"
            >
              Block
            </Button>
          </div>
          {invalid && (
            <p className="text-xs text-accent-red mt-1" role="alert" data-testid="settings-block-invalid">
              {PEER_ID_INVALID}
            </p>
          )}
          {!connected && <AgentRequiredNotice className="mt-2" data-testid="settings-blocklist-agent-required" />}
        </FormField>

        <div data-testid="settings-blocklist">
          {connected && blocked.isLoading && <p className="text-xs text-text-tertiary">Reading blocked list...</p>}
          {connected && blocked.isError && (
            <p className="text-xs text-accent-red" role="alert" data-testid="settings-blocklist-error">
              Could not read the blocked list from your agent.
            </p>
          )}
          {connected && !blocked.isLoading && !blocked.isError && ids.length === 0 && (
            <EmptyState size="sm" title="No blocked agents." data-testid="settings-blocklist-empty" />
          )}
          {ids.map(id => (
            <div
              key={id}
              className="flex items-center justify-between gap-2 py-2 border-b border-border-default last:border-b-0 text-xs"
              data-testid="settings-blocklist-row"
            >
              <span className="font-mono text-text-primary truncate" title={id}>
                {truncateAgentId(id)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                onClick={() => handleUnblock(id)}
                disabled={unblock.isPending}
                data-testid="settings-blocklist-unblock"
              >
                Unblock
              </Button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
