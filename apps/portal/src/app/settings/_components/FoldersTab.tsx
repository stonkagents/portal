/**
 * Purpose: Folders & Sync tab: the agent's data directory (from its storage setup check,
 *          changeable through the storage fix; a change applies on restart), the download
 *          folder derived from it the way the daemon does, and what the shared library uses.
 */
'use client';

import { useEffect, useState } from 'react';
import { Icon, Button } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { readStoragePath, SETUP_RESTART_REQUIRED_NOTE } from '@/lib/api/daemon-setup';
import { useSetupCheck, useSetupFix, SETUP_UNSUPPORTED_MESSAGE } from '@/lib/api/hooks/use-agent-settings';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { useLibrary } from '@/lib/api/hooks/use-transfers';
import { formatBytes } from '@/lib/api/transformers/gallery';
import { FormField, SectionTitle, SettingsCard, INPUT_CLS, READONLY_CLS } from './shared';

export const STORAGE_SAVED_TOAST = 'Storage directory saved';
export const STORAGE_HELPER =
  'Chunks, databases and downloads live here. A new folder must be under your profile, ProgramData or next to the current one; the change applies when the agent restarts.';

/** `<dataDir>/downloads`, joined with the separator the path already uses (the daemon uses filepath.Join). */
export function downloadsDir(dataDir: string): string {
  const sep = dataDir.includes('\\') ? '\\' : '/';
  return `${dataDir.replace(/[\\/]+$/, '')}${sep}downloads`;
}

export function FoldersTab() {
  const { connected } = useDaemon();
  const { addToast } = useToast();
  const { check, loading, unsupported } = useSetupCheck('storage');
  const fix = useSetupFix();
  const { data: library, isLoading: libraryLoading } = useLibrary(connected);
  const usedBytes = connected ? (library?.storage.used_bytes ?? null) : null;
  const fileCount = connected ? (library?.storage.file_count ?? null) : null;

  const { path, pendingPath } = connected ? readStoragePath(check) : { path: null, pendingPath: null };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path ?? '');

  /* A fresh answer from the agent resets the draft; editing keeps what the owner typed. */
  useEffect(() => {
    if (!editing) setDraft(path ?? '');
  }, [path, editing]);

  const editable = connected && !unsupported && !loading && path !== null;
  const trimmed = draft.trim();
  const canSave = editable && editing && trimmed !== '' && trimmed !== path && !fix.isPending;

  function handleSave() {
    if (!canSave) return;
    fix.mutate(
      { id: 'storage', params: { path: trimmed } },
      {
        onSuccess: result => {
          setEditing(false);
          addToast({
            title: STORAGE_SAVED_TOAST,
            ...(result.restartRequired ? { description: SETUP_RESTART_REQUIRED_NOTE } : {}),
            variant: 'success',
          });
        },
        onError: error => addToast({ title: 'Could not change the storage directory', description: error.message, variant: 'error' }),
      },
    );
  }

  return (
    <div data-testid="settings-folders">
      {/* Storage Paths */}
      <SettingsCard>
        <SectionTitle>Storage Paths</SectionTitle>
        <FormField label="Data Directory" helper={STORAGE_HELPER}>
          <div className="flex gap-2 items-center">
            {editing ? (
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
                disabled={!editable}
                aria-label="Data directory"
                data-testid="settings-data-dir"
              />
            ) : (
              <input
                className={READONLY_CLS}
                value={path ?? (connected ? (loading ? 'Reading from your agent...' : '-') : '-')}
                readOnly
                aria-label="Data directory"
                data-testid="settings-data-dir"
              />
            )}
            {editing ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon="check"
                  onClick={handleSave}
                  disabled={!canSave}
                  loading={fix.isPending}
                  data-testid="settings-data-dir-save"
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={fix.isPending}
                  data-testid="settings-data-dir-cancel"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon="edit-3"
                onClick={() => setEditing(true)}
                disabled={!editable}
                data-testid="settings-data-dir-change"
              >
                Change
              </Button>
            )}
          </div>
          {pendingPath && (
            <p className="text-xs text-accent-yellow mt-1" role="status" data-testid="settings-data-dir-pending">
              {SETUP_RESTART_REQUIRED_NOTE} New location: <span className="font-mono">{pendingPath}</span>
            </p>
          )}
          {unsupported && (
            <p className="text-xs text-accent-yellow mt-1" role="status" data-testid="settings-data-dir-unsupported">
              {SETUP_UNSUPPORTED_MESSAGE}
            </p>
          )}
          {!connected && <AgentRequiredNotice className="mt-2" data-testid="settings-data-dir-agent-required" />}
        </FormField>
        {path && (
          <FormField label="Download Folder" helper="Assets your agent fetches from peers land here, under the data directory.">
            <input className={READONLY_CLS + ' w-full'} value={downloadsDir(path)} readOnly data-testid="settings-download-dir" />
          </FormField>
        )}
      </SettingsCard>

      {/* Storage in use: what the shared library reports; the agent has no size cap to show */}
      <SettingsCard className="mb-0">
        <SectionTitle>Storage Used</SectionTitle>
        <div data-testid="settings-storage">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-text-secondary">Shared library</span>
            <span className="text-text-primary font-mono" data-testid="settings-storage-used">
              {usedBytes === null ? '-' : formatBytes(usedBytes)}
            </span>
          </div>
          {connected ? (
            <p className="text-xs text-text-tertiary mt-2">
              {libraryLoading || fileCount === null
                ? 'Reading shared library...'
                : `${fileCount} shared file${fileCount === 1 ? '' : 's'}`}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary mt-2" data-testid="settings-storage-offline">
              <Icon name="wifi-off" size="sm" className="shrink-0" /> Start your agent to see storage
            </p>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
