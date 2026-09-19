/**
 * Purpose: Tests for sidebar transfer rows as links and share icon correction
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/* The display name is read through its own hook; these tests are about the id and the rest of the surface. */
vi.mock('@/lib/api/hooks/use-agent-identity', () => ({
  useAgentIdentity: () => ({ data: null, isLoading: false, isFetched: true, isError: false }),
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: true,
    daemonStatus: 'online',
    health: { status: 'ok', peerId: 'QmTestPeer', peers: 3 },
  }),
}));

vi.mock('@/lib/api/hooks/use-transfers', () => ({
  useTransferStats: () => ({
    data: { downloading: 2, uploading: 1, completed: 5, failed: 0, active: 3, totalUp: '0 B', totalDown: '0 B', speedUp: 0, speedDown: 0 },
  }),
}));

vi.mock('@/lib/api/hooks/use-peers', () => ({
  usePeerReputation: () => ({ data: { clout: 50, rank: 'Silver', factors: [] } }),
}));

import { GallerySidebar } from '../_components/GallerySidebar';

describe('Transfer Row Links + Icon Fix', () => {
  const defaultProps = { onSearchOpen: vi.fn(), onShareOpen: vi.fn() };

  it('renders transfer rows as links to /transfers', () => {
    render(<GallerySidebar {...defaultProps} />);
    const summary = screen.getByTestId('transfer-summary');
    const links = summary.querySelectorAll('a[href="/transfers"]');
    expect(links.length).toBe(4);
  });

  it('uses share-2 icon on Share Asset button', () => {
    render(<GallerySidebar {...defaultProps} />);
    const shareBtn = screen.getByTestId('share-asset-btn');
    const icon = shareBtn.querySelector('use');
    expect(icon?.getAttribute('href')).toContain('share-2');
  });

  it('transfer rows have 44px minimum touch target', () => {
    render(<GallerySidebar {...defaultProps} />);
    const summary = screen.getByTestId('transfer-summary');
    const links = summary.querySelectorAll('a[href="/transfers"]');
    links.forEach(link => {
      const row = link.querySelector('[class*="min-h-"]');
      expect(row?.className).toContain('min-h-[44px]');
    });
  });
});
