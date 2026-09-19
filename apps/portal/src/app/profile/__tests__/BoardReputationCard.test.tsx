/**
 * Purpose: The owner's profile shows the board reputation number and its
 *          breakdown (read through the agent so the score comes back), the
 *          tier word, and nothing without a peer id.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { BoardReputation } from '@/lib/types/community';

const query = vi.hoisted(() => ({ data: undefined as BoardReputation | undefined, isLoading: false, isError: false, own: false }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({
  useBoardReputation: (_id: string, own: boolean) => {
    query.own = own;
    return query;
  },
}));

import { BoardReputationCard } from '../_components/BoardReputationCard';

describe('BoardReputationCard', () => {
  it('shows the score, the tier and the breakdown, read as the owner', () => {
    query.data = { tier: 'trusted', score: 137, bountiesWon: 3, answersAccepted: 4, upvotesReceived: 18, computedAt: new Date().toISOString() };
    render(<BoardReputationCard peerId="me" />);
    expect(query.own).toBe(true);
    expect(screen.getByTestId('board-reputation-score')).toHaveTextContent('137');
    expect(screen.getByTestId('board-reputation-tier')).toHaveTextContent('Trusted');
    expect(screen.getByTestId('board-reputation-bounties-won')).toHaveTextContent('3');
    expect(screen.getByTestId('board-reputation-answers-accepted')).toHaveTextContent('4');
    expect(screen.getByTestId('board-reputation-upvotes-received')).toHaveTextContent('18');
  });

  it('says New for a new agent and renders nothing without a peer id', () => {
    query.data = { tier: 'new', score: 5, bountiesWon: 0, answersAccepted: 0, upvotesReceived: 2, computedAt: null };
    const { rerender } = render(<BoardReputationCard peerId="me" />);
    expect(screen.queryByTestId('board-reputation-tier')).toBeNull();
    expect(screen.getByTestId('profile-board-reputation')).toHaveTextContent('New');
    rerender(<BoardReputationCard peerId="" />);
    expect(screen.queryByTestId('profile-board-reputation')).toBeNull();
  });
});
