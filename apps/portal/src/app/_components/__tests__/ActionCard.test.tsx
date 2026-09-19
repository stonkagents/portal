/**
 * Purpose: Tests for ActionCard — right-side Get Started card with chat + onboarding checklist
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionCard } from '../ActionCard';

/* Mock next/navigation */
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

/* Mock ClawMascot brand component */
vi.mock('@/components/brand/ClawMascot', () => ({
  ClawMascot: () => <div data-testid="claw-mascot" />,
}));

/* Mock useSocialConnections — twitter connected */
vi.mock('@/lib/api/hooks/use-social-connections', () => ({
  useSocialConnections: () => ({
    data: { connections: [{ platform: 'twitter' }] },
    isPending: false,
  }),
}));

const baseProps = {
  launchedToken: null as null | { name: string; ticker: string; imageDataUrl: string | null; contractAddr: string },
};

const mockToken = {
  name: 'TestAgent',
  ticker: 'TAGENT',
  imageDataUrl: null,
  contractAddr: 'So11111111111111111111111111111111111111112',
};

describe('ActionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('container', () => {
    it('renders with action-card test id', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('action-card')).toBeInTheDocument();
    });

    it('shows Get Started header', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('shows progress count in checklist', () => {
      render(<ActionCard {...baseProps} launchedToken={mockToken} walletConnected agentLive />);
      // wallet + token + agent + twitter = 4/4
      expect(screen.getByTestId('checklist-progress')).toHaveTextContent('4/4');
    });

    it('dismisses on X click and persists', () => {
      render(<ActionCard {...baseProps} />);
      fireEvent.click(screen.getByTestId('dismiss-action-card'));
      expect(screen.queryByTestId('action-card')).not.toBeInTheDocument();
      expect(localStorage.getItem('stonkagents:action-card-dismissed')).toBe('true');
    });

    it('stays hidden if localStorage flag is set', () => {
      localStorage.setItem('stonkagents:action-card-dismissed', 'true');
      render(<ActionCard {...baseProps} />);
      expect(screen.queryByTestId('action-card')).not.toBeInTheDocument();
    });
  });

  describe('chat section', () => {
    it('renders chat avatar', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('chat-avatar')).toBeInTheDocument();
    });

    it('shows agent name', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByText('Your Agent')).toBeInTheDocument();
    });

    it('shows initial agent message', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('chat-bubble-agent')).toBeInTheDocument();
    });

    it('renders 3 quick reply pills', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByText('Building an AI app')).toBeInTheDocument();
      expect(screen.getByText('Just exploring')).toBeInTheDocument();
      expect(screen.getByText('Looking for skills')).toBeInTheDocument();
    });

    it('navigates to /chat on quick reply click', () => {
      render(<ActionCard {...baseProps} />);
      fireEvent.click(screen.getByText('Building an AI app'));
      expect(mockPush).toHaveBeenCalledWith(`/chat?q=${encodeURIComponent('Building an AI app')}`);
    });

    it('renders chat input and send button', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByPlaceholderText('Ask your Agent anything...')).toBeInTheDocument();
      expect(screen.getByTestId('chat-send')).toBeInTheDocument();
    });

    it('navigates to /chat on send click', () => {
      render(<ActionCard {...baseProps} />);
      fireEvent.click(screen.getByTestId('chat-send'));
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });
  });

  describe('onboarding checklist', () => {
    it('renders the 4 items in product order', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('checklist')).toBeInTheDocument();
      const items = screen.getByTestId('checklist').querySelectorAll('[data-testid^="check-item-"]');
      expect(Array.from(items).map(el => el.getAttribute('data-testid'))).toEqual([
        'check-item-wallet',
        'check-item-token',
        'check-item-agent',
        'check-item-twitter',
      ]);
    });

    it('uses the StonkAgents vocabulary', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
      expect(screen.getByText('Launch your token')).toBeInTheDocument();
      expect(screen.getByText('Run your agent')).toBeInTheDocument();
    });

    it('marks Connect your wallet as done when the wallet is connected', () => {
      render(<ActionCard {...baseProps} walletConnected />);
      expect(screen.getByTestId('check-item-wallet').className).toContain('done');
    });

    it('marks Run your agent as done only once the agent is live', () => {
      const { rerender } = render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('check-item-agent').className).not.toContain('done');
      rerender(<ActionCard {...baseProps} agentLive />);
      expect(screen.getByTestId('check-item-agent').className).toContain('done');
    });

    it('does not promise a fixed credit amount for the launch (reward is granted on bind)', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('check-item-token')).not.toHaveTextContent('250');
    });

    it('marks Launch your token as done when launchedToken exists', () => {
      render(<ActionCard {...baseProps} launchedToken={mockToken} />);
      const item = screen.getByTestId('check-item-token');
      expect(item.className).toContain('done');
    });

    it('marks Launch your token as pending when no token', () => {
      render(<ActionCard {...baseProps} />);
      const item = screen.getByTestId('check-item-token');
      expect(item.className).not.toContain('done');
    });

    it('marks Connect Twitter as done when connected', () => {
      render(<ActionCard {...baseProps} />);
      const item = screen.getByTestId('check-item-twitter');
      expect(item.className).toContain('done');
    });

    it('highlights first non-done item as next', () => {
      render(<ActionCard {...baseProps} walletConnected />);
      // wallet=done, token=pending (first non-done) → next
      const item = screen.getByTestId('check-item-token');
      expect(item.className).toContain('next');
    });

    it('points at the wallet first when nothing is done', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('check-item-wallet').className).toContain('next');
      expect(screen.getByTestId('check-item-token').className).not.toContain('next');
    });

    it('renders progress bar', () => {
      render(<ActionCard {...baseProps} />);
      expect(screen.getByTestId('checklist-progress-bar')).toBeInTheDocument();
    });
  });
});
