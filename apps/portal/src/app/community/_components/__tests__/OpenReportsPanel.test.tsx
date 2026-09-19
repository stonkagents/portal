/**
 * Purpose: The open reports panel shows only to a platform peer and only while
 *          there are open reports; each row can be upheld, dismissed or opened.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BoardReport } from '@/lib/types/community';

const state = vi.hoisted(() => ({ platform: true, reports: [] as unknown[], loading: false }));
const resolve = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useIsPlatformPeer: () => state.platform }));
vi.mock('@/lib/api/hooks/use-board-platform', () => ({
  useOpenReports: (enabled: boolean) => ({ data: enabled ? state.reports : [], isLoading: state.loading }),
  useResolveReport: () => ({ mutate: resolve, isPending: false, variables: undefined }),
}));

import { OpenReportsPanel } from '../OpenReportsPanel';

const report: BoardReport = {
  id: 'rep1',
  targetType: 'reply',
  targetId: 'r1234567890',
  postId: 'p1',
  reason: 'scam',
  note: 'fake link',
  reporterPeerId: 'peer-r',
  reporterDisplayName: 'Rita',
  reporterTier: 'active',
  createdAt: new Date().toISOString(),
  excerpt: 'buy now',
};

beforeEach(() => {
  resolve.mockClear();
  state.platform = true;
  state.reports = [report];
});

describe('OpenReportsPanel', () => {
  it('renders nothing for a non-platform peer or without open reports', () => {
    state.platform = false;
    const { rerender } = render(<OpenReportsPanel onOpenPost={() => {}} />);
    expect(screen.queryByTestId('open-reports')).toBeNull();
    state.platform = true;
    state.reports = [];
    rerender(<OpenReportsPanel onOpenPost={() => {}} />);
    expect(screen.queryByTestId('open-reports')).toBeNull();
  });

  it('lists a report with its reason, note, excerpt and reporter tier, and resolves it', () => {
    const onOpenPost = vi.fn();
    render(<OpenReportsPanel onOpenPost={onOpenPost} />);
    expect(screen.getByTestId('open-reports-count')).toHaveTextContent('1');
    expect(screen.getByTestId('report-rep1')).toHaveTextContent('scam');
    expect(screen.getByTestId('report-rep1-excerpt')).toHaveTextContent('buy now');
    expect(screen.getByTestId('report-rep1-note')).toHaveTextContent('fake link');
    expect(screen.getByTestId('report-rep1-reporter')).toHaveTextContent('Rita');
    expect(screen.getByTestId('report-rep1-reporter-tier')).toHaveTextContent('Active');

    fireEvent.click(screen.getByTestId('report-rep1-uphold'));
    expect(resolve).toHaveBeenCalledWith({ reportId: 'rep1', action: 'uphold' });
    fireEvent.click(screen.getByTestId('report-rep1-dismiss'));
    expect(resolve).toHaveBeenCalledWith({ reportId: 'rep1', action: 'dismiss' });
    fireEvent.click(screen.getByTestId('report-rep1-open'));
    expect(onOpenPost).toHaveBeenCalledWith('p1');
  });

  it('collapses and expands', () => {
    render(<OpenReportsPanel onOpenPost={() => {}} />);
    fireEvent.click(screen.getByTestId('open-reports-toggle'));
    expect(screen.queryByTestId('report-rep1')).toBeNull();
    fireEvent.click(screen.getByTestId('open-reports-toggle'));
    expect(screen.getByTestId('report-rep1')).toBeInTheDocument();
  });
});
