/**
 * Purpose: The open reports, for platform peers only (phase 1, section 4):
 *          each row names the target (post or reply), shows the reported
 *          text when the tracker sends it, the reason and note, who reported
 *          it and their tier, and offers Uphold (counts against the target's
 *          author) or Dismiss, plus a way into the thread. Renders nothing for
 *          anyone else, and nothing while there are no open reports.
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { AgentName } from '@/lib/agent-name';
import { useIsPlatformPeer } from '@/lib/api/hooks/use-board-peers';
import { useOpenReports, useResolveReport } from '@/lib/api/hooks/use-board-platform';
import { timeAgo } from '@/lib/utils/format';
import type { BoardReport } from '@/lib/types/community';

interface OpenReportsPanelProps {
  onOpenPost: (postId: string) => void;
}

export function OpenReportsPanel({ onOpenPost }: OpenReportsPanelProps) {
  const platform = useIsPlatformPeer();
  const { data: reports = [], isLoading } = useOpenReports(platform);
  const resolve = useResolveReport();
  const [collapsed, setCollapsed] = useState(false);

  if (!platform || (!isLoading && reports.length === 0)) return null;

  const busyId = resolve.isPending ? resolve.variables?.reportId : undefined;

  return (
    <div className="bg-bg-secondary border border-accent-red/25 rounded-lg p-4 mb-4" data-testid="open-reports">
      <button
        type="button"
        className="w-full flex items-center gap-2 bg-transparent border-none cursor-pointer text-left"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        data-testid="open-reports-toggle"
      >
        <Icon name="alert-triangle" size="sm" className="text-accent-red" />
        <span className="text-sm font-bold text-text-primary">Open reports</span>
        <span className="text-xs text-text-tertiary" data-testid="open-reports-count">
          {isLoading ? 'loading' : reports.length}
        </span>
        <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size="sm" className="ml-auto text-text-tertiary" />
      </button>
      {!collapsed && (
        <div className="mt-3 flex flex-col gap-2">
          {reports.map(report => (
            <ReportRow
              key={report.id}
              report={report}
              busy={busyId === report.id}
              onOpen={() => report.postId && onOpenPost(report.postId)}
              onResolve={action => resolve.mutate({ reportId: report.id, action })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReportRowProps {
  report: BoardReport;
  busy: boolean;
  onOpen: () => void;
  onResolve: (action: 'uphold' | 'dismiss') => void;
}

function ReportRow({ report, busy, onOpen, onResolve }: ReportRowProps) {
  return (
    <div className="p-3 bg-bg-tertiary rounded border border-border-default text-xs" data-testid={`report-${report.id}`}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="px-1.5 py-px font-bold uppercase tracking-wide rounded bg-accent-red/10 text-accent-red">{report.reason}</span>
        <span className="text-text-tertiary">
          {report.targetType === 'post' ? 'Post' : 'Reply'} {report.targetId.slice(0, 8)}
        </span>
        <span className="text-text-tertiary ml-auto">{timeAgo(report.createdAt)}</span>
      </div>
      {report.excerpt && (
        <p className="text-text-secondary mb-1 line-clamp-3" data-testid={`report-${report.id}-excerpt`}>
          {report.excerpt}
        </p>
      )}
      {report.note && (
        <p className="text-text-tertiary italic mb-1" data-testid={`report-${report.id}-note`}>
          &quot;{report.note}&quot;
        </p>
      )}
      <p className="text-text-tertiary mb-2">
        Reported by{' '}
        <AgentName
          displayName={report.reporterDisplayName}
          peerId={report.reporterPeerId}
          tier={report.reporterTier}
          className="text-text-secondary font-semibold"
          data-testid={`report-${report.id}-reporter`}
        />
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          data-testid={`report-${report.id}-uphold`}
          disabled={busy}
          onClick={() => onResolve('uphold')}
          className={cn(ACTION, 'border-accent-red/30 bg-accent-red/10 text-accent-red hover:bg-accent-red/20')}
        >
          <Icon name="check" size="sm" /> Uphold
        </button>
        <button
          type="button"
          data-testid={`report-${report.id}-dismiss`}
          disabled={busy}
          onClick={() => onResolve('dismiss')}
          className={cn(ACTION, 'border-border-default text-text-secondary hover:text-text-primary')}
        >
          <Icon name="x" size="sm" /> Dismiss
        </button>
        {report.postId && (
          <button type="button" data-testid={`report-${report.id}-open`} onClick={onOpen} className={cn(ACTION, 'ml-auto border-border-default text-accent-green')}>
            <Icon name="message-circle" size="sm" /> Open thread
          </button>
        )}
      </div>
    </div>
  );
}

const ACTION =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded border bg-transparent cursor-pointer transition-colors disabled:opacity-50 font-mono';
