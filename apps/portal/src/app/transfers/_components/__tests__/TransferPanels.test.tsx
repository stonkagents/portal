/**
 * Purpose: TDD tests for HistoryPanel — Load More pagination
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryPanel } from '../TransferPanels';

// Mock the transfer hooks
const mockUseTransferHistory = vi.fn();
vi.mock('@/lib/api/hooks/use-transfers', () => ({
  useTransferHistory: (...args: unknown[]) => mockUseTransferHistory(...args),
  useLibrary: () => ({ data: null }),
}));

// Mock the transformers barrel (formatBytesShort)
vi.mock('@/lib/api/transformers', () => ({
  formatBytesShort: (bytes: number) => `${bytes} B`,
}));

const makeRecord = (id: number) => ({
  id: `record-${id}`,
  cid: `cid-${id}`,
  filename: `file-${id}.claw-skill`,
  direction: 'download' as const,
  total_size: 1024 * id,
  state: 'completed' as const,
  completed_at: '2026-02-16T10:00:00Z',
  error_message: null,
});

describe('HistoryPanel completed_at null safety', () => {
  it('renders dash when completed_at is null', () => {
    const record = { ...makeRecord(1), completed_at: null };
    mockUseTransferHistory.mockReturnValue({
      data: { records: [record], total: 1 },
    });
    render(<HistoryPanel />);
    const panel = screen.getByTestId('history-panel');
    expect(panel.textContent).not.toContain('Invalid Date');
    expect(panel.textContent).toContain('-');
  });

  it('renders dash when completed_at is empty string', () => {
    const record = { ...makeRecord(1), completed_at: '' };
    mockUseTransferHistory.mockReturnValue({
      data: { records: [record], total: 1 },
    });
    render(<HistoryPanel />);
    const panel = screen.getByTestId('history-panel');
    expect(panel.textContent).not.toContain('Invalid Date');
    expect(panel.textContent).toContain('-');
  });
});

describe('HistoryPanel Load More', () => {
  it('shows Load More button when there are more records than displayed', () => {
    mockUseTransferHistory.mockReturnValue({
      data: {
        records: Array.from({ length: 50 }, (_, i) => makeRecord(i + 1)),
        total: 120,
      },
    });

    render(<HistoryPanel />);
    const loadMore = screen.getByTestId('history-load-more');
    expect(loadMore).toBeDefined();
    expect(loadMore.textContent).toContain('Load More');
  });

  it('does not show Load More when all records are loaded', () => {
    mockUseTransferHistory.mockReturnValue({
      data: {
        records: Array.from({ length: 5 }, (_, i) => makeRecord(i + 1)),
        total: 5,
      },
    });

    render(<HistoryPanel />);
    expect(screen.queryByTestId('history-load-more')).toBeNull();
  });
});
