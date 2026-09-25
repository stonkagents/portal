/**
 * Purpose: One curated pack card: what the pack holds, what this agent already
 *          has, and the install that writes the rest into the agent's state
 *          directory. Every item keeps its own outcome, because one refused item
 *          does not stop the pack.
 *
 *          Nothing here runs anything. What an item declares that it wants is
 *          shown next to it and never acted on.
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button, Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { TransformedPack, TransformedPackItem } from '@/lib/api/transformers/gallery';
import type { InstalledPackItem, PackInstallResult } from '@/lib/api/daemon-packs';
import { useInstallPack } from '@/lib/api/hooks/use-packs';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';
import {
  missingItemIds,
  packStatusLabel,
  packStatusTone,
  packWantsLines,
  resultsById,
  type PackInstallMode,
} from '@/lib/utils/pack-install';

/** The refusal a different installed version earns; the only one the portal offers an action for. */
const VERSION_DIFFERS = 'VERSION_DIFFERS';

export interface PackCardColors {
  bg: string;
  text: string;
}

interface PackCardProps {
  pack: TransformedPack;
  colors: PackCardColors;
  className: string;
  /** A type filter is on and this card is not what the filter is about. */
  dimmed?: boolean;
  /** Whether an install control may be shown at all, and whether it may be pressed. */
  mode: PackInstallMode;
  /** Why it may not be pressed; the disabled control says so instead of pretending. */
  blockedReason?: string;
  /** What this agent already has, by item id. */
  installed: Map<string, InstalledPackItem>;
}

export function PackCard({ pack, colors, className, dimmed = false, mode, blockedReason, installed }: PackCardProps) {
  const [open, setOpen] = useState(false);
  const install = useInstallPack();
  const canInstall = mode === 'ready';
  const showInstall = mode !== 'unavailable';
  const answer = install.data ?? null;
  const results = resultsById(answer?.results);

  const installable = pack.items.filter(item => item.id !== '' && item.cid !== '');
  const missing = missingItemIds(
    installable.map(item => item.id),
    installed,
  );
  const everythingInstalled = installable.length > 0 && missing.length === 0;

  function run(items: string[], replace = false) {
    if (items.length === 0) return;
    setOpen(true);
    install.mutate({ items, replace });
  }

  return (
    <div
      className={cn(className, 'flex flex-col gap-2', 'transition-colors hover:border-accent-green/30', dimmed && 'opacity-40')}
      data-testid={`pack-${pack.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`pack-items-${pack.id}`}
        data-testid={`pack-toggle-${pack.id}`}
        className="flex gap-3 items-start w-full text-left bg-transparent border-none p-0 cursor-pointer font-[inherit] text-[inherit]"
      >
        <div className={cn('w-9 h-9 rounded flex items-center justify-center shrink-0', colors.bg, colors.text)}>
          <Icon name={pack.icon as IconName} size="sm" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary mb-0.5">{pack.title}</div>
          <div className={cn('text-xs text-text-secondary mb-2', !open && 'line-clamp-2')}>{pack.description}</div>
          <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
            <span>{pack.assets} items</span>
            {installed.size > 0 && installable.length > missing.length && (
              <>
                <span aria-hidden="true">·</span>
                <span data-testid={`pack-installed-count-${pack.id}`}>{installable.length - missing.length} installed</span>
              </>
            )}
            <Icon name="chevron-down" size="sm" className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
          </div>
        </div>
      </button>

      {open && (
        <ul
          id={`pack-items-${pack.id}`}
          className="list-none m-0 p-0 flex flex-col gap-2 border-t border-border-default pt-2"
          data-testid={`pack-items-${pack.id}`}
        >
          {pack.items.map(item => (
            <PackItemRow
              key={item.id || item.filename}
              packId={pack.id}
              item={item}
              installed={installed.get(item.id) ?? null}
              result={results.get(item.id) ?? null}
              canInstall={canInstall}
              showInstall={showInstall}
              blockedReason={blockedReason}
              pending={install.isPending}
              onInstall={replace => run([item.id], replace)}
            />
          ))}
          {pack.items.length === 0 && <li className="text-xs text-text-tertiary">No items listed.</li>}
        </ul>
      )}

      {/* The pack action, and what the agent said about the last attempt. */}
      <div className="flex flex-col gap-1.5 border-t border-border-default pt-2">
        {everythingInstalled && !answer && (
          <p className="text-[11px] text-accent-green m-0" data-testid={`pack-all-installed-${pack.id}`}>
            Your agent has every item in this pack.
          </p>
        )}

        {installable.length === 0 && (
          <p className="text-[11px] text-text-tertiary m-0" data-testid={`pack-unavailable-${pack.id}`}>
            Nothing in this pack is on the network yet, so there is nothing to install.
          </p>
        )}

        {showInstall && installable.length > 0 && !everythingInstalled && (
          <Button
            size="sm"
            variant="secondary"
            icon="download"
            className="self-start"
            disabled={!canInstall || install.isPending}
            loading={install.isPending}
            title={canInstall ? undefined : blockedReason}
            onClick={() => run(missing)}
            data-testid={`pack-install-${pack.id}`}
          >
            {install.isPending
              ? 'Installing'
              : missing.length === installable.length
                ? `Install ${missing.length} items`
                : `Install ${missing.length} remaining`}
          </Button>
        )}

        {/* A pack is fetched from whoever holds it, so the wait is not ours to promise: measured
            installs of thirteen items have taken anywhere from fifteen seconds to two minutes.
            Say so while it runs rather than letting a quiet button look stuck. */}
        {install.isPending && (
          <p className="text-[11px] text-text-tertiary m-0" data-testid={`pack-waiting-${pack.id}`} role="status">
            Fetching from the network. This can take a couple of minutes; you can leave the page open.
          </p>
        )}

        {answer?.message && (
          <p className="text-[11px] text-text-secondary m-0" data-testid={`pack-summary-${pack.id}`} role="status">
            {answer.message}
          </p>
        )}

        {install.error && (
          <p className="text-[11px] text-accent-red m-0" data-testid={`pack-error-${pack.id}`} role="alert">
            {install.error.message}
          </p>
        )}
      </div>
    </div>
  );
}

interface PackItemRowProps {
  packId: string;
  item: TransformedPackItem;
  installed: InstalledPackItem | null;
  result: PackInstallResult | null;
  canInstall: boolean;
  showInstall: boolean;
  blockedReason?: string;
  pending: boolean;
  onInstall: (replace: boolean) => void;
}

/** One item: what it is, what installing it writes, and how the last attempt went. */
function PackItemRow({
  packId,
  item,
  installed,
  result,
  canInstall,
  showInstall,
  blockedReason,
  pending,
  onInstall,
}: PackItemRowProps) {
  const wants = packWantsLines(result?.wants ?? installed?.wants ?? null);
  const onNetwork = item.cid !== '' && item.id !== '';
  /* A row the agent already has, or that this attempt wrote, is not offered again. */
  const settled =
    installed !== null || result?.status === 'installed' || result?.status === 'replaced' || result?.status === 'already_installed';
  const canReplace = result?.code === VERSION_DIFFERS;

  return (
    <li className="flex flex-col gap-1 text-xs" data-testid={`pack-item-${packId}-${item.id || item.filename}`}>
      {/* The type and the action share a line, so the words below get the card's whole width
          (a card is 260px wide on a phone, which leaves nothing beside a badge and a button). */}
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 px-1.5 py-0.5 rounded border border-border-default text-[10px] font-mono text-text-tertiary">
          {assetTypeLabel(`.${item.type}`)}
        </span>

        {result && (
          <span
            className={cn('shrink-0 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono', packStatusTone(result.status))}
            data-testid={`pack-item-status-${item.id}`}
          >
            {packStatusLabel(result.status)}
          </span>
        )}
        {!result && installed && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded-sm border border-accent-green/30 bg-accent-green/10 text-accent-green text-[10px] font-mono"
            data-testid={`pack-item-installed-${item.id}`}
          >
            Installed
          </span>
        )}
        {showInstall && !settled && onNetwork && (
          <button
            type="button"
            disabled={!canInstall || pending}
            title={canInstall ? undefined : blockedReason}
            onClick={() => onInstall(false)}
            className="shrink-0 min-h-[44px] md:min-h-0 md:py-1 px-2 rounded-sm border border-accent-green/40 bg-transparent text-accent-green text-[10px] font-mono cursor-pointer hover:bg-accent-green/10 disabled:opacity-40 disabled:cursor-default"
            data-testid={`pack-item-install-${item.id}`}
          >
            Install
          </button>
        )}
      </div>

      <span className="block font-semibold text-text-primary">{item.title}</span>
      <span className="block text-text-secondary">{item.description}</span>

      {/* What installing it writes, in the catalog's own words, before anything is written. */}
      {!settled && item.touches && (
        <p className="m-0 text-[11px] text-text-tertiary" data-testid={`pack-item-touches-${item.id}`}>
          {item.touches}
        </p>
      )}

      {!onNetwork && (
        <p className="m-0 text-[11px] text-text-tertiary" data-testid={`pack-item-unavailable-${item.id}`}>
          Not on the network yet, so it cannot be installed.
        </p>
      )}

      {result && (
        <p
          className={cn('m-0 text-[11px]', result.status === 'failed' ? 'text-accent-red' : 'text-text-secondary')}
          data-testid={`pack-item-message-${item.id}`}
        >
          {result.message}
        </p>
      )}

      {showInstall && canReplace && (
        <button
          type="button"
          disabled={!canInstall || pending}
          onClick={() => onInstall(true)}
          className="self-start min-h-[44px] md:min-h-0 md:py-1 px-2 rounded-sm border border-accent-yellow/40 bg-transparent text-accent-yellow text-[10px] font-mono cursor-pointer hover:bg-accent-yellow/10 disabled:opacity-40 disabled:cursor-default"
          data-testid={`pack-item-replace-${item.id}`}
        >
          Replace the installed version
        </button>
      )}

      {installed && (
        <p className="m-0 text-[11px] text-text-tertiary" data-testid={`pack-item-where-${item.id}`}>
          Version {installed.version}. Remove it in Settings, under Packs.
        </p>
      )}

      {wants.map(line => (
        <p key={line} className="m-0 text-[11px] text-text-tertiary" data-testid={`pack-item-wants-${item.id}`}>
          {line}
        </p>
      ))}
    </li>
  );
}
