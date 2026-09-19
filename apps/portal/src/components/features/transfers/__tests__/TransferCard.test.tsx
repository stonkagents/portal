/**
 * Purpose: TDD tests for TransferCard — clipboard, CID display, peer count, actions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransferCard } from '../TransferCard';
import type { Transfer } from '@/lib/types';

const mockAddToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast, dismissToast: vi.fn(), toasts: [] }),
}));

const baseTransfer: Transfer = {
  id: 'QmTestCid1234567890abcdef',
  assetName: 'test-skill.claw-skill',
  assetType: '.claw-skill',
  direction: 'download',
  peerName: '',
  peerId: '',
  size: 1024000,
  progress: 45,
  speed: 2.5,
  eta: 120,
  status: 'active',
  startedAt: '',
  completedAt: null,
  errorMessage: null,
  peerCount: 0,
};

describe('TransferCard', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('copies CID to clipboard when Copy CID is clicked', () => {
    render(<TransferCard transfer={baseTransfer} />);
    const copyBtn = screen.getByTestId(`transfer-copy-${baseTransfer.id}`);
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(baseTransfer.id);
  });

  it('shows success toast after copying CID', () => {
    mockAddToast.mockClear();
    render(<TransferCard transfer={baseTransfer} />);
    const copyBtn = screen.getByTestId(`transfer-copy-${baseTransfer.id}`);
    fireEvent.click(copyBtn);
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'CID copied', variant: 'success' }));
  });

  it('displays truncated real CID, not hardcoded bafybei prefix', () => {
    render(<TransferCard transfer={baseTransfer} />);
    const card = screen.getByTestId(`transfer-card-${baseTransfer.id}`);
    expect(card.textContent).toContain(baseTransfer.id.slice(0, 8));
    expect(card.textContent).toContain(baseTransfer.id.slice(-4));
    expect(card.textContent).not.toContain('bafybei');
  });

  it('displays speed with exactly one decimal place', () => {
    const t: Transfer = { ...baseTransfer, speed: 2.456789 };
    render(<TransferCard transfer={t} />);
    const card = screen.getByTestId(`transfer-card-${t.id}`);
    // Should show "2.5 MB/s" (toFixed(1)), not "2.456789 MB/s"
    expect(card.textContent).toContain('2.5 MB/s');
    expect(card.textContent).not.toContain('2.456789');
  });

  it('shows real peer count when peerCount > 0', () => {
    const t: Transfer = { ...baseTransfer, peerCount: 3 };
    render(<TransferCard transfer={t} />);
    const card = screen.getByTestId(`transfer-card-${t.id}`);
    expect(card.textContent).toMatch(/Peers:\s*3/);
  });

  it('shows dash for peer count when peerCount is 0', () => {
    const t: Transfer = { ...baseTransfer, peerCount: 0 };
    render(<TransferCard transfer={t} />);
    const card = screen.getByTestId(`transfer-card-${t.id}`);
    expect(card.textContent).toMatch(/Peers:\s*-/);
  });

  it('uses design system transition token for progress bar, not hardcoded duration-300', () => {
    render(<TransferCard transfer={baseTransfer} />);
    const card = screen.getByTestId(`transfer-card-${baseTransfer.id}`);
    const progressFill = card.querySelector('[style*="width"]');
    expect(progressFill).toBeDefined();
    expect(progressFill!.className).toContain('duration-[var(--transition-base)]');
    expect(progressFill!.className).not.toContain('duration-300');
  });
});

// TransferSections tests
import { TransferSections } from '@/app/transfers/_components/TransferSections';

describe('TransferSections', () => {
  it('formats completedAt as localized date, not raw ISO string', () => {
    const completed: Transfer = {
      ...baseTransfer,
      status: 'completed',
      progress: 100,
      completedAt: '2026-02-16T14:30:00Z',
    };
    render(<TransferSections activeTab="completed" showCards={true} completedTransfers={[completed]} failedTransfers={[]} />);
    const section = screen.getByTestId('completed-transfers');
    // Should NOT show raw ISO string
    expect(section.textContent).not.toContain('2026-02-16T14:30:00Z');
    // Should contain "Completed" label with formatted date
    expect(section.textContent).toContain('Completed');
  });

  it('an active transfer offers Pause and Cancel; a paused one Resume and Cancel', () => {
    const onPause = vi.fn();
    const onCancel = vi.fn();
    const onResume = vi.fn();
    const { id } = baseTransfer;
    const { rerender } = render(<TransferCard transfer={baseTransfer} onPause={onPause} onCancel={onCancel} onResume={onResume} />);
    fireEvent.click(screen.getByTestId(`transfer-cancel-${id}`));
    expect(onCancel).toHaveBeenCalledWith(id);
    fireEvent.click(screen.getByTestId(`transfer-pause-${id}`));
    expect(onPause).toHaveBeenCalledWith(id);
    expect(screen.queryByTestId(`transfer-resume-${id}`)).not.toBeInTheDocument();

    rerender(
      <TransferCard transfer={{ ...baseTransfer, status: 'queued' }} onPause={onPause} onCancel={onCancel} onResume={onResume} />,
    );
    fireEvent.click(screen.getByTestId(`transfer-resume-${id}`));
    expect(onResume).toHaveBeenCalledWith(id);
    expect(screen.getByTestId(`transfer-cancel-${id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`transfer-pause-${id}`)).not.toBeInTheDocument();
  });
});
