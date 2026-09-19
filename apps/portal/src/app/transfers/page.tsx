/**
 * Purpose: Transfers Page — live download/upload status from the agent, library, history
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { TabBar, FilterChip, Button, Icon, AgentOfflineNotice } from '@/components/ui';
import { TransferCard } from '@/components/features/transfers';
import { useDaemon } from '@/providers/DaemonProvider';
import { SetUpAgentLink, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';
import { LocalAccessNotice } from '@/components/features/install/LocalAccessNotice';

import {
  useTransfers,
  usePauseTransfer,
  useResumeTransfer,
  useCancelTransfer,
  useRetryTransfer,
  usePauseAll,
  useResumeAll,
  useClearCompleted,
  useLibrary,
} from '@/lib/api/hooks/use-transfers';
import { TransferSections } from './_components/TransferSections';
import { LibraryPanel, HistoryPanel } from './_components/TransferPanels';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';

const TYPE_FILTERS = ['All', '.claw-skill', '.claw-prompt', '.claw-memory', '.claw-workflow'];

export default function TransfersPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('All');
  const { connected } = useDaemon();
  /* Bulk actions POST to the agent: inert offline, the banner above says what unlocks them. */
  const { title: agentTitle } = useAgentRequired();

  // Real daemon data via React Query (polls every 5s)
  const { data: transferData } = useTransfers();
  useLibrary(connected); // keep polling for Library tab
  const pauseTransfer = usePauseTransfer();
  const resumeTransfer = useResumeTransfer();
  const cancelTransfer = useCancelTransfer();
  const retryTransfer = useRetryTransfer();
  const pauseAll = usePauseAll();
  const resumeAll = useResumeAll();
  const clearCompleted = useClearCompleted();

  const transfers = transferData?.transfers ?? [];
  const stats = transferData?.stats ?? {
    active: 0,
    uploading: 0,
    downloading: 0,
    completed: 0,
    failed: 0,
    totalUp: '0 B',
    totalDown: '0 B',
    speedUp: 0,
    speedDown: 0,
  };
  const showCards = !['library', 'history'].includes(activeTab);

  // Split transfers by status for sections
  const completedTransfers = transfers.filter(t => t.status === 'completed');
  const failedTransfers = transfers.filter(t => t.status === 'failed');
  const activeOrQueuedTransfers = transfers.filter(t => t.status === 'active' || t.status === 'queued');

  // Dynamic tab counts from live data
  const tabCounts = {
    all: transfers.length,
    downloading: transfers.filter(t => t.direction === 'download' && t.status === 'active').length,
    uploading: transfers.filter(t => t.direction === 'upload' && t.status === 'active').length,
    seeding: transfers.filter(t => t.progress === 100 && t.status === 'active').length,
    completed: completedTransfers.length,
    failed: failedTransfers.length,
  };

  const TABS = [
    { id: 'all', label: 'All', count: tabCounts.all },
    { id: 'downloading', label: 'Installing', count: tabCounts.downloading },
    { id: 'uploading', label: 'Sharing', count: tabCounts.uploading },
    { id: 'seeding', label: 'Seeding', count: tabCounts.seeding },
    { id: 'completed', label: 'Completed', count: tabCounts.completed },
    { id: 'failed', label: 'Failed', count: tabCounts.failed },
    { id: 'library', label: 'Library' },
    { id: 'history', label: 'History' },
  ];

  const filtered = activeOrQueuedTransfers.filter(t => {
    if (activeTab === 'downloading') return t.direction === 'download' && t.status === 'active';
    if (activeTab === 'uploading') return t.direction === 'upload' && t.status === 'active';
    if (activeTab === 'seeding') return t.progress === 100 && t.status === 'active';
    if (activeTab === 'completed' || activeTab === 'failed') return false;
    if (typeFilter !== 'All') return t.assetType === typeFilter;
    return true;
  });

  return (
    <div className="flex-1 min-w-0 p-4 flex flex-col gap-4 max-w-[1100px] mx-auto w-full" data-testid="transfers-page">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          <Icon name="arrow-up-down" /> Transfers
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Active installs, recent completions, and optional seeding for downloads you keep locally
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="transfer-stats">
        {[
          {
            icon: 'arrow-up-down' as const,
            value: String(stats.active),
            label: 'Active Transfers',
            color: 'text-accent-green',
          },
          { icon: 'upload' as const, value: stats.totalUp, label: 'Total Shared', color: 'text-accent-green' },
          { icon: 'download' as const, value: stats.totalDown, label: 'Total Installed', color: 'text-accent-blue' },
        ].map(s => (
          <div
            key={s.label}
            className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center hover:shadow-[0_0_20px_rgba(0,255,0,0.05)] transition-all"
          >
            <div className="flex justify-center mb-1">
              <Icon name={s.icon} size="sm" className="text-text-tertiary" />
            </div>
            <div className={cn('text-2xl font-bold leading-tight', s.color)}>{s.value}</div>
            <div className="text-xs text-text-secondary uppercase tracking-wide mt-1">{s.label}</div>
          </div>
        ))}
        <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center hover:shadow-[0_0_20px_rgba(0,255,0,0.05)] transition-all">
          <div className="flex justify-center mb-1">
            <Icon name="zap" size="sm" className="text-text-tertiary" />
          </div>
          <div className="text-2xl font-bold leading-tight">
            <span className="text-accent-green">&uarr;{stats.speedUp.toFixed(1)}</span>{' '}
            <span className="text-accent-blue">&darr;{stats.speedDown.toFixed(1)}</span>
          </div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-1">Current Speed (MB/s)</div>
        </div>
      </div>

      <LocalAccessNotice priority={1} />
      {!connected && (
        <AgentOfflineNotice
          state="offline"
          detail="Live transfers show once it is installed and running."
          action={<SetUpAgentLink className="text-xs" />}
          data-testid="agent-offline-notice"
        />
      )}

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {showCards && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {activeTab === 'all' && (
            <div className="flex gap-1 flex-wrap" data-testid="transfer-type-filters">
              {TYPE_FILTERS.map(f => (
                <FilterChip key={f} label={assetTypeLabel(f)} active={typeFilter === f} onClick={() => setTypeFilter(f)} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto flex-wrap" data-testid="transfer-actions">
            <span className="text-xs font-semibold text-text-secondary">{filtered.length} active transfers</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="pause-all"
                onClick={() => pauseAll.mutate()}
                disabled={!connected || pauseAll.isPending}
                title={connected ? undefined : agentTitle}
              >
                {pauseAll.isPending ? 'Pausing...' : 'Pause All'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="resume-all"
                onClick={() => resumeAll.mutate()}
                disabled={!connected || resumeAll.isPending}
                title={connected ? undefined : agentTitle}
              >
                {resumeAll.isPending ? 'Resuming...' : 'Resume All'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="clear-completed"
                onClick={() => clearCompleted.mutate()}
                disabled={!connected || clearCompleted.isPending}
                title={connected ? undefined : agentTitle}
              >
                {clearCompleted.isPending ? 'Clearing...' : 'Clear Completed'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        {showCards && activeTab !== 'completed' && activeTab !== 'failed' && (
          <div data-testid="active-transfers">
            {filtered.map(t => (
              <TransferCard
                key={t.id}
                transfer={t}
                onPause={cid => pauseTransfer.mutate(cid)}
                onResume={cid => resumeTransfer.mutate(cid)}
                onCancel={cid => cancelTransfer.mutate(cid)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-text-secondary text-sm">No transfers match this filter</div>
            )}
          </div>
        )}

        <TransferSections
          activeTab={activeTab}
          showCards={showCards}
          completedTransfers={completedTransfers}
          failedTransfers={failedTransfers}
          onRetry={cid => retryTransfer.mutate(cid)}
        />
        {activeTab === 'library' && <LibraryPanel />}
        {activeTab === 'history' && <HistoryPanel />}
      </div>
    </div>
  );
}
