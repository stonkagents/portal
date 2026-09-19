/**
 * Purpose: Tests for sidebar offline behavior — daemon offline shows dashes and Offline text
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/* The display name is read through its own hook; these tests are about the id and the rest of the surface. */
vi.mock('@/lib/api/hooks/use-agent-identity', () => ({
  useAgentIdentity: () => ({ data: null, isLoading: false, isFetched: true, isError: false }),
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({ connected: false, isOnline: false, health: null }),
}));

vi.mock('@/lib/api/hooks/use-transfers', () => ({
  useTransferStats: () => ({ data: undefined }),
}));

vi.mock('@/lib/api/hooks/use-peers', () => ({
  usePeerReputation: () => ({ data: undefined }),
}));

import { GallerySidebar } from '../_components/GallerySidebar';

describe('GallerySidebar offline behavior', () => {
  it('shows "Offline" badge when daemon is disconnected', () => {
    render(<GallerySidebar onSearchOpen={() => {}} onShareOpen={() => {}} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows "Agent offline" for peer ID when the agent is offline (no bare dashes)', () => {
    render(<GallerySidebar onSearchOpen={() => {}} onShareOpen={() => {}} />);
    const card = screen.getByTestId('your-agent-card');
    expect(card.textContent).toContain('Agent offline');
    expect(card.textContent).not.toContain('-');
  });

  it('shows the start-your-agent note in transfer section when disconnected', () => {
    render(<GallerySidebar onSearchOpen={() => {}} onShareOpen={() => {}} />);
    expect(screen.getByText(/start your agent to see live transfers/i)).toBeInTheDocument();
  });

  it('shows zero transfer counts when daemon is offline (no bare dashes)', () => {
    render(<GallerySidebar onSearchOpen={() => {}} onShareOpen={() => {}} />);
    const transferSection = screen.getByTestId('transfer-summary');
    const counts = transferSection.querySelectorAll('.font-bold');
    expect(counts.length).toBe(4);
    counts.forEach(count => {
      expect(count.textContent).toBe('0');
    });
  });
});
