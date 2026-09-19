/**
 * Purpose: Tests for CreditsCompactRow: compact credits + the account's real social
 *          connections (GET /api/v1/social/connections). Only the wallet is linkable from
 *          the portal; other platforms appear once connected and never as an offer.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreditsCompactRow, SOCIAL_BONUS } from '../CreditsCompactRow';

/* Mock useCredits */
vi.mock('@/lib/api/hooks/use-credits', () => ({
  useCredits: () => ({
    data: { free_balance: 250, paid_balance: 75, total: 325, lifetime_purchased: 0, lifetime_social_granted: 0 },
    isPending: false,
  }),
}));

/* Connections as the tracker reports them; each test sets what it needs. */
const social = vi.hoisted(() => ({ connections: [] as { platform: string }[] }));
vi.mock('@/lib/api/hooks/use-social-connections', () => ({
  useSocialConnections: () => ({ data: { connections: social.connections }, isPending: false }),
}));

/* The wallet chip goes through the shared connect prompt (then WalletLinkEffect links the peer). */
const walletPrompt = vi.hoisted(() => ({ connected: false, connecting: false, ensureConnected: vi.fn() }));
vi.mock('@/components/features/wallet', () => ({ useConnectPrompt: () => walletPrompt }));

describe('CreditsCompactRow', () => {
  beforeEach(() => {
    social.connections = [];
    walletPrompt.connected = false;
    walletPrompt.connecting = false;
    walletPrompt.ensureConnected.mockReset().mockResolvedValue(true);
  });

  it('mirrors the tracker bonus table (social_service.go)', () => {
    expect(SOCIAL_BONUS).toMatchObject({ wallet: 100, github: 50, twitter: 25, email: 25, discord: 25, telegram: 25 });
  });

  describe('compact state (default)', () => {
    it('renders credits with the free/paid breakdown', () => {
      render(<CreditsCompactRow />);
      expect(screen.getByTestId('credits-compact-row')).toBeInTheDocument();
      expect(screen.getByText('325')).toBeInTheDocument();
      expect(screen.getByText('credits')).toBeInTheDocument();
      expect(screen.getByText(/250 free/)).toBeInTheDocument();
      expect(screen.getByText(/75 paid/)).toBeInTheDocument();
    });

    it('shows only the wallet dot when nothing is connected', () => {
      render(<CreditsCompactRow />);
      const dots = screen.getByTestId('social-dots').querySelectorAll('[data-testid^="dot-"]');
      expect(dots).toHaveLength(1);
      expect(screen.getByTestId('dot-wallet').className).toContain('text-tertiary');
    });

    it('adds a green dot per real connection', () => {
      social.connections = [{ platform: 'wallet' }, { platform: 'twitter' }];
      render(<CreditsCompactRow />);
      const dots = screen.getByTestId('social-dots').querySelectorAll('[data-testid^="dot-"]');
      expect(dots).toHaveLength(2);
      expect(screen.getByTestId('dot-wallet').className).toContain('accent-green');
      expect(screen.getByTestId('dot-twitter').textContent).toBe('X');
      expect(screen.queryByTestId('dot-github')).not.toBeInTheDocument();
    });
  });

  describe('expanded state', () => {
    it('toggles open on dots click and back on collapse', () => {
      render(<CreditsCompactRow />);
      fireEvent.click(screen.getByTestId('social-dots'));
      expect(screen.getByTestId('credits-expanded')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('collapse-credits'));
      expect(screen.queryByTestId('credits-expanded')).not.toBeInTheDocument();
    });

    it('offers only the wallet link when nothing is connected, with no invented bonuses', () => {
      render(<CreditsCompactRow />);
      fireEvent.click(screen.getByTestId('social-dots'));
      expect(screen.getByTestId('social-connected-count')).toHaveTextContent('0 connected');
      const chips = screen.getByTestId('credits-expanded').querySelectorAll('[data-testid^="social-chip-"]');
      expect(chips).toHaveLength(1);
      expect(screen.getByTestId('social-chip-wallet')).toHaveTextContent('Link wallet');
      expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    });

    it('opens the wallet connect prompt when the wallet chip is clicked', () => {
      render(<CreditsCompactRow />);
      fireEvent.click(screen.getByTestId('social-dots'));
      fireEvent.click(screen.getByTestId('social-chip-wallet'));
      expect(walletPrompt.ensureConnected).toHaveBeenCalledTimes(1);
    });

    it('shows the wallet as linked once the portal wallet is connected', () => {
      walletPrompt.connected = true;
      render(<CreditsCompactRow />);
      fireEvent.click(screen.getByTestId('social-dots'));
      expect(screen.getByTestId('social-chip-wallet')).toHaveTextContent('Wallet linked');
      expect(screen.getByTestId('social-chip-wallet').tagName).toBe('SPAN');
      expect(screen.getByTestId('social-connected-count')).toHaveTextContent('1 connected');
    });

    it('renders connected badges for the platforms the tracker reports, and nothing for the rest', () => {
      social.connections = [{ platform: 'wallet' }, { platform: 'github' }];
      render(<CreditsCompactRow />);
      fireEvent.click(screen.getByTestId('social-dots'));
      expect(screen.getByTestId('social-connected-count')).toHaveTextContent('2 connected');
      expect(screen.getByTestId('social-chip-wallet')).toHaveTextContent('Wallet');
      expect(screen.getByTestId('social-chip-github')).toHaveTextContent('GitHub');
      for (const id of ['twitter', 'discord', 'email', 'telegram']) {
        expect(screen.queryByTestId(`social-chip-${id}`)).not.toBeInTheDocument();
      }
    });
  });
});
