/**
 * Purpose: A search result that the pack catalog pins can be installed on its own,
 *          not only as part of its pack: the same daemon endpoint, addressed by the
 *          CID the catalog pins for that item. Anything the catalog does not pin has
 *          no button here, because the agent would refuse it.
 */
'use client';

import { cn } from '@/lib/utils/cn';
import type { TransformedPackItem } from '@/lib/api/transformers/gallery';
import { useInstallPack } from '@/lib/api/hooks/use-packs';
import { packStatusLabel, packStatusTone, packWantsLines, type PackInstallMode } from '@/lib/utils/pack-install';

interface AssetPackInstallProps {
  /** The catalog row for this CID: what it is, and what installing it writes. */
  item: TransformedPackItem;
  /** Whether the install control may be shown at all, and whether it may be pressed. */
  mode: PackInstallMode;
  /** Why it may not be pressed, for the disabled button. */
  blockedReason?: string;
  /** Already on this agent: the button is replaced by a plain statement. */
  installed: boolean;
}

export function AssetPackInstall({ item, mode, blockedReason, installed }: AssetPackInstallProps) {
  const install = useInstallPack();
  const canInstall = mode === 'ready';
  const result = install.data?.results[0] ?? null;
  const wants = packWantsLines(result?.wants);
  const settled =
    installed || result?.status === 'installed' || result?.status === 'replaced' || result?.status === 'already_installed';

  return (
    <div className="flex flex-col gap-1 border-t border-border-default pt-2" data-testid={`asset-pack-install-${item.id}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-text-tertiary">
          {item.packTitle ? `In ${item.packTitle}. ` : ''}
          {item.touches}
        </span>
        {mode !== 'unavailable' && !settled && (
          <button
            type="button"
            disabled={!canInstall || install.isPending}
            title={canInstall ? undefined : blockedReason}
            onClick={() => install.mutate({ cid: item.cid })}
            className="shrink-0 min-h-[44px] md:min-h-0 md:py-1 px-2 rounded-sm border border-accent-green/40 bg-transparent text-accent-green text-[11px] font-mono cursor-pointer hover:bg-accent-green/10 disabled:opacity-40 disabled:cursor-default"
            data-testid={`asset-pack-install-button-${item.id}`}
          >
            {install.isPending ? 'Installing' : 'Add to your agent'}
          </button>
        )}
        {installed && !result && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded-sm border border-accent-green/30 bg-accent-green/10 text-accent-green text-[10px] font-mono"
            data-testid={`asset-pack-installed-${item.id}`}
          >
            Installed
          </span>
        )}
        {result && (
          <span
            className={cn('shrink-0 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono', packStatusTone(result.status))}
            data-testid={`asset-pack-status-${item.id}`}
          >
            {packStatusLabel(result.status)}
          </span>
        )}
      </div>

      {result && (
        <p
          className={cn('m-0 text-[11px]', result.status === 'failed' ? 'text-accent-red' : 'text-text-secondary')}
          data-testid={`asset-pack-message-${item.id}`}
        >
          {result.message}
        </p>
      )}

      {install.error && (
        <p className="m-0 text-[11px] text-accent-red" data-testid={`asset-pack-error-${item.id}`} role="alert">
          {install.error.message}
        </p>
      )}

      {wants.map(line => (
        <p key={line} className="m-0 text-[11px] text-text-tertiary">
          {line}
        </p>
      ))}
    </div>
  );
}
