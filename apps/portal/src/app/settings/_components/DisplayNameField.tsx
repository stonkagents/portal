/**
 * Purpose: Settings > Identity display-name field. Loads the current name from
 *          the daemon, saves it back (0..50 chars, empty clears), and tells the
 *          owner where the name shows up. Inert with a notice while the agent
 *          is offline, and while the running agent has no identity endpoint.
 */
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { DISPLAY_NAME_MAX_LENGTH, sanitizeDisplayName } from '@/lib/api/daemon-identity';
import { IDENTITY_UNSUPPORTED_MESSAGE, useAgentIdentity, useSaveAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { FormField } from './shared';

const INPUT_CLS =
  'w-full min-h-[44px] px-3 py-2 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 disabled:cursor-not-allowed';

export const DISPLAY_NAME_SAVED_TOAST = 'Display name saved';
export const DISPLAY_NAME_SYNCING_NOTE = 'Saved on your agent. The network will pick it up on the next heartbeat.';
export const DISPLAY_NAME_HELPER = `Shown instead of your Agent ID on posts, the network list and your token page. Up to ${DISPLAY_NAME_MAX_LENGTH} characters; leave empty to show the Agent ID.`;

export function DisplayNameField() {
  const { connected } = useDaemon();
  const { addToast } = useToast();
  const identity = useAgentIdentity();
  const save = useSaveAgentIdentity();

  const saved = identity.data?.displayName ?? '';
  const [draft, setDraft] = useState(saved);

  /* A fresh answer from the agent (first load, or another tab saved) resets the draft. */
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const unsupported = connected && identity.isFetched && identity.data === null;
  const cleaned = sanitizeDisplayName(draft);
  const changed = cleaned !== saved;
  const tooLong = draft.trim().length > DISPLAY_NAME_MAX_LENGTH;
  const editable = connected && !unsupported && !identity.isLoading;
  const canSave = editable && changed && !tooLong && !save.isPending;

  function handleSave() {
    if (!canSave) return;
    save.mutate(cleaned, {
      onSuccess: result => {
        setDraft(result.displayName);
        /* trackerSynced false: the name is on the agent, the tracker just has not acknowledged it yet. */
        const description = result.trackerSynced === false ? DISPLAY_NAME_SYNCING_NOTE : undefined;
        addToast({ title: DISPLAY_NAME_SAVED_TOAST, ...(description ? { description } : {}), variant: 'success' });
      },
      onError: error => {
        addToast({ title: 'Could not save display name', description: error.message, variant: 'error' });
      },
    });
  }

  return (
    <FormField label="Display Name" helper={DISPLAY_NAME_HELPER}>
      <div className="flex gap-2 items-center">
        <input
          className={INPUT_CLS}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            }
          }}
          maxLength={DISPLAY_NAME_MAX_LENGTH + 10}
          placeholder={connected ? 'Your agent’s public name' : 'Agent offline'}
          disabled={!editable}
          aria-invalid={tooLong || undefined}
          aria-label="Display name"
          data-testid="settings-display-name"
        />
        <Button
          variant="primary"
          size="sm"
          icon="check"
          onClick={handleSave}
          disabled={!canSave}
          loading={save.isPending}
          data-testid="settings-display-name-save"
        >
          Save
        </Button>
      </div>
      {tooLong && (
        <p className="text-xs text-accent-red mt-1" role="alert" data-testid="settings-display-name-too-long">
          Display names are up to {DISPLAY_NAME_MAX_LENGTH} characters.
        </p>
      )}
      {unsupported && (
        <p className="text-xs text-accent-yellow mt-1" role="status" data-testid="settings-display-name-unsupported">
          {IDENTITY_UNSUPPORTED_MESSAGE}
        </p>
      )}
      {identity.isError && connected && (
        <p className="text-xs text-accent-red mt-1" role="alert" data-testid="settings-display-name-load-failed">
          Could not read the display name from your agent. {identity.error.message}
        </p>
      )}
      {!connected && <AgentRequiredNotice className="mt-2" data-testid="settings-display-name-agent-required" />}
    </FormField>
  );
}
