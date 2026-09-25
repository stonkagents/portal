/**
 * Purpose: Curated Packs: scroll cards for the tracker's pack catalog (GET /api/packs),
 *          and the install that writes a pack's items into the agent's own state
 *          directory. A card expands to list its items with what installing each one
 *          writes; the catalog carries no install counts, so none are shown.
 *          Dimmed when a type filter is active.
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { AgentOfflineNotice } from '@/components/ui/AgentOfflineNotice';
import { SetUpAgentLink } from '@/components/features/onboarding/AgentRequiredNotice';
import type { TransformedPack } from '@/lib/api/transformers/gallery';
import { useInstalledPacks } from '@/lib/api/hooks/use-packs';
import { useDaemon } from '@/providers/DaemonProvider';
import { ApiRequestError } from '@/lib/api/errors';
import {
  installedById,
  packDestinationLine,
  PACK_AGENT_OFFLINE,
  PACK_NOTHING_RUNS,
  PACK_NOT_READY,
  PACK_UNSUPPORTED,
  type PackInstallMode,
} from '@/lib/utils/pack-install';
import { PackCard } from './PackCard';

interface CuratedPacksProps {
  packs: TransformedPack[];
  activeFilter?: string;
  /** The first catalog answer is still in flight. */
  loading?: boolean;
  /** The catalog could not be read. */
  error?: boolean;
  className?: string;
}

const colorMap: Record<TransformedPack['color'], { bg: string; text: string }> = {
  green: { bg: 'bg-accent-green/12', text: 'text-accent-green' },
  blue: { bg: 'bg-accent-blue/12', text: 'text-accent-blue' },
  purple: { bg: 'bg-accent-purple/12', text: 'text-accent-purple' },
  red: { bg: 'bg-accent-red/12', text: 'text-accent-red' },
};

const cardClass = 'rounded-lg border border-border-default bg-bg-primary p-3 flex-[0_0_260px] snap-start md:flex-[0_0_auto]';

const noticeClass = 'rounded-sm border border-border-default bg-bg-secondary px-3 py-2 text-xs text-text-secondary';

export function CuratedPacks({ packs, activeFilter, loading = false, error = false, className }: CuratedPacksProps) {
  const isFiltered = !!activeFilter && activeFilter !== 'All';
  const { connected } = useDaemon();
  const { data: installedAnswer, error: installedError } = useInstalledPacks();

  /* A running agent that predates the install path answers 404 for the installed list. */
  const unsupported = installedError instanceof ApiRequestError && installedError.status === 404;
  const notReady = installedAnswer?.status === 'not_ready';
  const unreachable = !unsupported && installedError != null;
  const canInstall = connected && !unsupported && !notReady && !unreachable;
  /* No agent means no control at all: a notice points at the install page instead of a dead button. */
  const mode: PackInstallMode = !connected ? 'unavailable' : canInstall ? 'ready' : 'blocked';

  const installed = installedById(installedAnswer?.items);
  const destination = canInstall ? packDestinationLine(installedAnswer?.stateDir) : '';
  const blockedReason = !connected
    ? PACK_AGENT_OFFLINE
    : unsupported
      ? PACK_UNSUPPORTED
      : notReady
        ? (installedAnswer?.message ?? PACK_NOT_READY)
        : unreachable
          ? installedError.message
          : undefined;

  return (
    <div className={className} data-testid="curated-packs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-accent-green flex items-center gap-2">
          <Icon name="package" size="sm" /> Curated Packs
        </span>
      </div>

      <p className="text-xs text-text-tertiary mb-2 mt-0" data-testid="packs-nothing-runs">
        {PACK_NOTHING_RUNS}
      </p>

      {/* Why the install controls are not there, in the agent's own words where it has them. */}
      {!connected && (
        <AgentOfflineNotice
          state="offline"
          detail={PACK_AGENT_OFFLINE}
          action={<SetUpAgentLink className="text-xs" />}
          className="mb-3"
          data-testid="packs-offline"
        />
      )}

      {connected && unsupported && (
        <p className={cn(noticeClass, 'mb-3')} data-testid="packs-unsupported" role="status">
          {PACK_UNSUPPORTED}
        </p>
      )}

      {connected && notReady && (
        <p className={cn(noticeClass, 'mb-3')} data-testid="packs-not-ready" role="status">
          {installedAnswer?.message || PACK_NOT_READY}
        </p>
      )}

      {connected && unreachable && (
        <p className={cn(noticeClass, 'mb-3')} data-testid="packs-unreachable" role="status">
          {installedError.message}
        </p>
      )}

      {destination && (
        <p className="text-xs text-text-tertiary mb-2 mt-0 font-mono break-all" data-testid="packs-destination">
          {destination}
        </p>
      )}

      {installedAnswer?.stateDir.note && (
        <p className="text-xs text-text-tertiary mb-2 mt-0" data-testid="packs-state-note">
          {installedAnswer.stateDir.note}
        </p>
      )}

      {/* Scroll container: horizontal on mobile, vertical on desktop */}
      <div
        className={cn(
          'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2',
          'md:flex-col md:overflow-x-visible md:overflow-y-auto md:max-h-[420px] md:snap-y md:pb-0',
          'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-default',
        )}
      >
        {loading &&
          [1, 2, 3].map(i => (
            <div key={i} className={cn(cardClass, 'h-[92px] animate-pulse')} data-testid="pack-skeleton">
              <span className="sr-only">Loading packs</span>
            </div>
          ))}

        {!loading && error && (
          <p className="text-xs text-text-tertiary py-4" data-testid="packs-error">
            The pack catalog could not be loaded.
          </p>
        )}

        {!loading && !error && packs.length === 0 && (
          <p className="text-xs text-text-tertiary py-4" data-testid="packs-empty">
            No curated packs yet.
          </p>
        )}

        {!loading &&
          !error &&
          packs.map(pack => (
            <PackCard
              key={pack.id}
              pack={pack}
              colors={colorMap[pack.color]}
              className={cardClass}
              dimmed={isFiltered}
              mode={mode}
              blockedReason={blockedReason}
              installed={installed}
            />
          ))}
      </div>
    </div>
  );
}
