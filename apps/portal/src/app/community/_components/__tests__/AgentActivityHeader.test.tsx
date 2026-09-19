/**
 * Purpose: The agent activity header: the agent's name with its tier badge (plain
 *          text, not a link to itself), the board-summary numbers, the Posts /
 *          Replied in sub-tabs, the profile and back links, and the notice for a
 *          peer the tracker never saw.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentBoardSummary } from '@/lib/types/community';

const summary = vi.hoisted(() => ({ data: undefined as AgentBoardSummary | null | undefined, isLoading: false }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useAgentBoardSummary: () => summary }));

import { AgentActivityHeader, summaryStats } from '../AgentActivityHeader';

const PEER = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';
const NOW = Date.parse('2026-09-16T12:00:00Z');
const full: AgentBoardSummary = {
  peerId: PEER,
  displayName: 'Agent Bot',
  reputationTier: 'trusted',
  posts: 12,
  replies: 40,
  acceptedAnswers: 3,
  bountiesWon: 2,
  lastActiveAt: '2026-09-16T09:00:00Z',
};

describe('AgentActivityHeader', () => {
  beforeEach(() => {
    summary.data = full;
    summary.isLoading = false;
  });

  it('names the agent with its tier, without a link to itself, and shows the numbers', () => {
    render(<AgentActivityHeader peerId={PEER} activity="posts" onActivityChange={vi.fn()} now={NOW} />);
    const name = screen.getByTestId('agent-activity-name');
    expect(name).toHaveTextContent('Agent Bot');
    expect(name.tagName).toBe('SPAN');
    expect(screen.getByTestId('agent-activity-name-tier')).toHaveTextContent('Trusted');
    expect(screen.getByTestId('agent-activity-peer-id')).toHaveTextContent('12D3KooWtest123a...89ab');
    expect(screen.getByTestId('agent-activity-stat-posts')).toHaveTextContent('Posts12');
    expect(screen.getByTestId('agent-activity-stat-replies')).toHaveTextContent('Replies40');
    expect(screen.getByTestId('agent-activity-stat-accepted')).toHaveTextContent('Accepted answers3');
    expect(screen.getByTestId('agent-activity-stat-bounties')).toHaveTextContent('Bounties won2');
    expect(screen.getByTestId('agent-activity-stat-active')).toHaveTextContent('Last active3h ago');
    expect(screen.getByTestId('agent-activity-profile')).toHaveAttribute('href', `/peers?peer=${PEER}`);
    expect(screen.getByTestId('agent-activity-back')).toHaveAttribute('href', '/community');
    expect(screen.getByTestId('agent-activity-header').querySelectorAll('a')).toHaveLength(2);
  });

  it('switches between Posts and Replied in', () => {
    const onActivityChange = vi.fn();
    const { rerender } = render(<AgentActivityHeader peerId={PEER} activity="posts" onActivityChange={onActivityChange} />);
    expect(screen.getByTestId('agent-activity-posts')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('agent-activity-replies')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('agent-activity-replies'));
    expect(onActivityChange).toHaveBeenCalledWith('replies');
    rerender(<AgentActivityHeader peerId={PEER} activity="replies" onActivityChange={onActivityChange} />);
    expect(screen.getByTestId('agent-activity-replies')).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to the masked id while the summary loads and says so for an unknown peer', () => {
    summary.data = undefined;
    summary.isLoading = true;
    const { rerender } = render(<AgentActivityHeader peerId={PEER} activity="posts" onActivityChange={vi.fn()} />);
    expect(screen.getByTestId('agent-activity-name')).toHaveTextContent('12D3KooWtest123a...89ab');
    expect(screen.queryByTestId('agent-activity-stats')).toBeNull();
    expect(screen.queryByTestId('agent-activity-unknown')).toBeNull();
    summary.data = null;
    summary.isLoading = false;
    rerender(<AgentActivityHeader peerId={PEER} activity="posts" onActivityChange={vi.fn()} />);
    expect(screen.getByTestId('agent-activity-unknown')).toHaveTextContent('The board has no record of 12D3KooWtest123a...89ab yet.');
    expect(screen.queryByTestId('agent-activity-stats')).toBeNull();
  });

  it('reads never for an agent without activity', () => {
    expect(summaryStats({ ...full, posts: 0, replies: 0, lastActiveAt: null }, NOW).map(s => s.value)).toEqual(['0', '0', '3', '2', 'never']);
  });
});
