/**
 * Purpose: Packs tab: the pack items this agent has installed, read from its own
 *          index (GET /api/v1/packs/installed): what it is, which pack it came
 *          from, its version, when it was written and the exact files on disk.
 *          Removal deletes only those files, and asks first.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Icon, Modal } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { useInstalledPacks, useRemovePackItem } from '@/lib/api/hooks/use-packs';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { ApiRequestError } from '@/lib/api/errors';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';
import { formatDateTime, timeAgo } from '@/lib/utils/format';
import {
  packDestinationLine,
  packRemovalSentence,
  packWantsLines,
  PACK_NOTHING_RUNS,
  PACK_NOT_READY,
  PACK_UNSUPPORTED,
} from '@/lib/utils/pack-install';
import type { InstalledPackItem } from '@/lib/api/daemon-packs';
import { SectionTitle, SettingsCard } from './shared';

export const PACK_REMOVED_TOAST = 'Removed from your agent';
export const PACK_REMOVE_FAILED_TOAST = 'Could not remove it';

export function PacksTab() {
  const { connected } = useDaemon();
  const { data, error, isLoading } = useInstalledPacks();
  const remove = useRemovePackItem();
  const { addToast } = useToast();
  const [confirming, setConfirming] = useState<InstalledPackItem | null>(null);

  const unsupported = error instanceof ApiRequestError && error.status === 404;
  const notReady = data?.status === 'not_ready';
  const items = data?.items ?? [];
  const destination = packDestinationLine(data?.stateDir);

  function confirmRemove() {
    const item = confirming;
    if (!item) return;
    remove.mutate(item.id, {
      onSuccess: answer => {
        setConfirming(null);
        addToast({ title: PACK_REMOVED_TOAST, description: answer.message, variant: 'success' });
      },
      onError: removeError => {
        setConfirming(null);
        addToast({ title: PACK_REMOVE_FAILED_TOAST, description: removeError.message, variant: 'error' });
      },
    });
  }

  return (
    <div data-testid="settings-packs">
      <SettingsCard>
        <SectionTitle>Installed packs</SectionTitle>
        <p className="text-xs text-text-tertiary mb-4 mt-0">{PACK_NOTHING_RUNS}</p>

        <AgentRequiredNotice />

        {connected && unsupported && (
          <p className="text-sm text-text-secondary" data-testid="packs-tab-unsupported">
            {PACK_UNSUPPORTED}
          </p>
        )}

        {connected && !unsupported && error && (
          <p className="text-sm text-text-secondary" data-testid="packs-tab-error" role="status">
            {error.message}
          </p>
        )}

        {connected && notReady && (
          <p className="text-sm text-text-secondary" data-testid="packs-tab-not-ready" role="status">
            {data?.message || PACK_NOT_READY}
          </p>
        )}

        {connected && isLoading && (
          <p className="text-sm text-text-tertiary" data-testid="packs-tab-loading">
            Reading what your agent has installed.
          </p>
        )}

        {connected && !error && !notReady && !isLoading && items.length === 0 && (
          <p className="text-sm text-text-secondary" data-testid="packs-tab-empty">
            Your agent has nothing installed from a pack.{' '}
            <Link href="/gallery" className="text-accent-green no-underline hover:underline">
              Curated packs are in the gallery.
            </Link>
          </p>
        )}

        {connected && items.length > 0 && (
          <>
            {destination && (
              <p className="text-xs text-text-tertiary font-mono break-all mb-3 mt-0" data-testid="packs-tab-destination">
                {destination}
              </p>
            )}
            <ul className="list-none m-0 p-0 flex flex-col gap-3" data-testid="packs-tab-list">
              {items.map(item => (
                <InstalledRow key={item.id} item={item} onRemove={() => setConfirming(item)} busy={remove.isPending} />
              ))}
            </ul>
          </>
        )}
      </SettingsCard>

      <Modal open={confirming !== null} onClose={() => setConfirming(null)} title="Remove from your agent" maxWidth="max-w-md">
        {confirming && (
          <div className="flex flex-col gap-4" data-testid="packs-remove-confirm">
            <div className="flex flex-col gap-2 text-sm text-text-secondary">
              <p className="m-0">{packRemovalSentence(confirming)}</p>
              <ul className="list-none m-0 p-0 flex flex-col gap-1 font-mono text-xs text-text-tertiary break-all">
                {confirming.paths.map(path => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setConfirming(null)} data-testid="packs-remove-cancel">
                Keep it
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="minus"
                loading={remove.isPending}
                onClick={confirmRemove}
                data-testid="packs-remove-confirm-button"
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InstalledRow({ item, onRemove, busy }: { item: InstalledPackItem; onRemove: () => void; busy: boolean }) {
  const wants = packWantsLines(item.wants);
  return (
    <li
      className="rounded-lg border border-border-default bg-bg-primary p-3 flex flex-col gap-2"
      data-testid={`packs-tab-item-${item.id}`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <span className="shrink-0 px-1.5 py-0.5 rounded border border-border-default text-[10px] font-mono text-text-tertiary">
          {assetTypeLabel(`.${item.type}`)}
        </span>
        <div className="flex-1 min-w-[140px]">
          <div className="text-sm font-semibold text-text-primary">{item.title || item.name}</div>
          {item.description && <div className="text-xs text-text-secondary">{item.description}</div>}
        </div>
        <Button variant="ghost" size="sm" icon="minus" disabled={busy} onClick={onRemove} data-testid={`packs-tab-remove-${item.id}`}>
          Remove
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <Icon name="package" size="sm" className="w-3 h-3" /> {item.pack}
        </span>
        <span aria-hidden="true">·</span>
        <span>Version {item.version}</span>
        <span aria-hidden="true">·</span>
        <span title={formatDateTime(item.installedAt)}>Installed {timeAgo(item.installedAt)}</span>
      </div>

      <ul className="list-none m-0 p-0 flex flex-col gap-0.5 font-mono text-[11px] text-text-tertiary break-all">
        {item.paths.map(path => (
          <li key={path}>{path}</li>
        ))}
      </ul>

      {wants.map(line => (
        <p key={line} className="m-0 text-[11px] text-text-tertiary">
          {line}
        </p>
      ))}
    </li>
  );
}
