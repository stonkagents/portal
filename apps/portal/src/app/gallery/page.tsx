/**
 * Purpose: Gallery (Knowledge Hub) Page — stats, network map, packs, search modal
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, Button, FilterChip, Modal, Input, EmptyState } from '@/components/ui';
import { CuratedPacks, SwarmActivityFeed, ShareAssetModal } from '@/components/features/gallery';
import { NetworkMap } from '@/components/features/network-map';
import { useGallery } from '@/lib/api/hooks/use-gallery';
import { usePeers } from '@/lib/api/hooks/use-peers';
import { useActivity } from '@/lib/api/hooks/use-activity';
import { useGallerySearch } from '@/lib/api/hooks/use-gallery-search';
import { usePacks } from '@/lib/api/hooks/use-packs';
import { useToast } from '@/providers/ToastProvider';
import { useDaemon } from '@/providers/DaemonProvider';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { daemonApi, USE_REAL_DAEMON } from '@/lib/api/daemon';
import { formatBytes } from '@/lib/api/transformers/gallery';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { ApiRequestError } from '@/lib/api/errors';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';
import { GallerySidebar } from './_components/GallerySidebar';
import { GalleryRecentDownloads } from './_components/GalleryRecentDownloads';

interface SearchResult {
  cid: string;
  name: string;
  type: string;
  size: string;
  agents: number;
  rep: number;
}

const TYPE_FILTERS = ['All', '.vec', '.traj', '.claw-skill', '.claw-prompt', '.claw-memory', '.claw-workflow'];

const TYPE_BADGE: Record<string, string> = {
  '.vec': 'text-accent-green border-accent-green/30 bg-accent-green/8',
  '.traj': 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/8',
  '.claw-skill': 'text-accent-green border-accent-green/30 bg-accent-green/8',
  '.claw-prompt': 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/8',
  '.claw-memory': 'text-accent-blue border-accent-blue/15 bg-accent-blue/8',
  '.claw-workflow': 'text-accent-purple border-accent-purple/30 bg-accent-purple/8',
};

export default function GalleryPage() {
  const { data: galleryData, isLoading: galleryLoading, isError: galleryError } = useGallery();
  const { connected, health } = useDaemon();
  /* Downloads are queued on the agent: offline, the search results say so and Download is disabled. */
  const { title: agentTitle } = useAgentRequired();
  const { data: peers, isLoading: peersLoading, isError: peersError } = usePeers();
  const { data: activityData } = useActivity();
  const { data: packsData, isLoading: packsLoading, isError: packsError } = usePacks();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const totalShared = galleryData?.stats?.totalShared ?? '0';
  const activityItems = activityData ?? [];
  /* The pack catalog comes from the tracker only: a skeleton while it loads, a note when it fails. */
  const packs = packsData ?? [];

  const [typeFilter, setTypeFilter] = useState('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('All');
  const [downloadingCid, setDownloadingCid] = useState<string | null>(null);

  const { data: searchData } = useGallerySearch(searchQuery, searchFilter);
  const serverResults: SearchResult[] = (searchData?.results ?? []).map(r => ({
    cid: r.cid,
    name: r.name,
    type: r.type,
    size: r.size,
    agents: r.downloads,
    rep: r.rep,
  }));
  const filtered = serverResults;

  const handleDownloadAsset = async (cid: string, name: string) => {
    if (downloadingCid === cid || !connected) return;
    if (!USE_REAL_DAEMON) {
      addToast({ title: 'Your agent is offline.', description: 'Start it to download this.', variant: 'error' });
      return;
    }
    setDownloadingCid(cid);
    try {
      const result = await daemonApi.download(cid);
      if (!result) {
        const mapped = mapErrorToUserMessage(
          new ApiRequestError(503, { code: 'SERVICE_UNAVAILABLE', message: 'Download returned empty response' }),
        );
        addToast({ title: mapped?.title ?? 'Download failed', description: mapped?.description, variant: 'error' });
        return;
      }
      addToast({ title: `Download queued: ${name}`, variant: 'success', autoDismiss: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
    } catch (err: unknown) {
      const mapped = mapErrorToUserMessage(err);
      addToast({ title: mapped?.title ?? 'Download failed', description: mapped?.description, variant: 'error' });
    } finally {
      setDownloadingCid(prev => (prev === cid ? null : prev));
    }
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 mx-auto w-full max-w-[1400px]" data-testid="gallery-page">
      <div className="flex-1 min-w-0 p-4 flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
            <Icon name="sparkles" /> Knowledge Hub
          </h1>
          <p className="text-sm text-text-secondary mt-1">Discover, share, and install agent knowledge across the network</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up" data-testid="gallery-stats">
          {[
            {
              icon: 'upload' as const,
              value: `${formatBytes(connected ? health.transfer.uploadSpeedBps : 0)}/s`,
              label: 'Up',
              color: 'text-accent-green',
              loading: false,
            },
            {
              icon: 'download' as const,
              value: `${formatBytes(connected ? health.transfer.downloadSpeedBps : 0)}/s`,
              label: 'Down',
              color: 'text-accent-blue',
              loading: false,
            },
            {
              icon: 'users' as const,
              value: (peers?.length ?? 0).toLocaleString(),
              label: 'Active Agents',
              color: 'text-accent-green',
              /* A skeleton only while the first answer is in flight; a failed or offline fetch shows the figure we have. */
              loading: connected && peersLoading && !peersError,
            },
            {
              icon: 'hard-drive' as const,
              value: totalShared,
              label: 'Total Shared',
              color: 'text-accent-yellow',
              loading: connected && galleryLoading && !galleryError,
            },
          ].map(s => (
            <div
              key={s.label}
              className="glass bg-bg-secondary rounded-lg p-3 text-center hover:bg-white/4 hover:shadow-[0_0_20px_rgba(0,255,0,0.05)] transition-[background-color,box-shadow]"
            >
              <div className="flex justify-center mb-1">
                <Icon name={s.icon} size="sm" className="text-text-tertiary" />
              </div>
              {s.loading ? (
                <div className="h-8 w-16 mx-auto bg-bg-tertiary rounded animate-pulse" data-testid={`stat-skeleton-${s.label}`} />
              ) : (
                <div className={cn('text-2xl font-bold leading-tight', s.color)}>{s.value}</div>
              )}
              <div className="text-xs text-text-secondary uppercase tracking-wide mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        {!connected && (
          <p className="flex items-center gap-1.5 text-xs text-text-tertiary -mt-2" data-testid="gallery-offline-note">
            <Icon name="wifi-off" size="sm" className="shrink-0" /> Start your agent to see live transfers
          </p>
        )}

        <GalleryRecentDownloads />

        <div className="animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <NetworkMap variant="card" />
        </div>

        <div className="flex gap-1 overflow-x-auto scrollbar-none" data-testid="gallery-filters">
          {TYPE_FILTERS.map(f => (
            <FilterChip key={f} label={assetTypeLabel(f)} active={typeFilter === f} onClick={() => setTypeFilter(f)} />
          ))}
        </div>

        <div
          className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 animate-fade-in-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          data-testid="discovery-grid"
        >
          <CuratedPacks packs={packs} activeFilter={typeFilter} loading={packsLoading && !packsError} error={packsError} />
          <SwarmActivityFeed items={activityItems} live={connected} />
        </div>
      </div>

      <GallerySidebar onSearchOpen={() => setSearchOpen(true)} onShareOpen={() => setShareOpen(true)} />

      <ShareAssetModal open={shareOpen} onClose={() => setShareOpen(false)} />

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search Network">
        <div className="flex flex-col gap-4">
          <Input
            icon="search"
            placeholder="Search assets, peers, CIDs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            data-testid="gallery-search-input"
          />
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map(f => (
              <FilterChip key={f} label={assetTypeLabel(f)} active={searchFilter === f} onClick={() => setSearchFilter(f)} />
            ))}
          </div>
          <AgentRequiredNotice data-testid="gallery-download-agent-required" />
          <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
            {filtered.map(r => (
              <div
                key={r.cid}
                className="flex flex-col gap-2 p-3 bg-bg-tertiary border border-border-default rounded-lg hover:border-accent-green/30 transition-colors"
                data-testid={`search-result-${r.cid}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary break-all">{r.name}</span>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 text-xs font-bold rounded border uppercase tracking-wide',
                      TYPE_BADGE[r.type] ?? 'text-text-secondary border-border-default bg-bg-tertiary',
                    )}
                  >
                    {assetTypeLabel(r.type)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-3 text-xs text-text-secondary">
                    <span>{r.size}</span>
                    <span>{r.agents} agents</span>
                    <span className="text-accent-green">&starf; {r.rep}</span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon="download"
                    loading={downloadingCid === r.cid}
                    disabled={!connected || (downloadingCid != null && downloadingCid !== r.cid)}
                    title={agentTitle}
                    onClick={() => handleDownloadAsset(r.cid, r.name)}
                  >
                    {downloadingCid === r.cid ? 'Downloading...' : 'Download'}
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <EmptyState size="sm" title="No results found." className="py-8" />}
          </div>
        </div>
      </Modal>
    </div>
  );
}
