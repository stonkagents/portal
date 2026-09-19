/**
 * Story: Home two-step flow — done
 * Purpose: Tests for HeroConnectedHome — the live phase: celebration banner with the
 *          credits granted on bind, tracker-backed token card, mint + external links.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeroConnectedHome } from '../HeroConnectedHome';
import type { HomePageState } from '../useHomePage';
import type { TokenMetricsResponse } from '@/lib/types/backend';
import type { LaunchRecord } from '@/lib/api/launches';

/* Mock next/link as a simple anchor */
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/* Mock DaemonProvider to return a test peerId */
const TEST_PEER_ID = '12D3KooWTESTPEERIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxVXHf';
/* The display name is read through its own hook; these tests are about the id and the rest of the surface. */
vi.mock('@/lib/api/hooks/use-agent-identity', () => ({
  useAgentIdentity: () => ({ data: null, isLoading: false, isFetched: true, isError: false }),
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: true,
    daemonStatus: 'online' as const,
    health: { status: 'ok', peerId: TEST_PEER_ID, peers: 2 },
    refresh: vi.fn(),
    toggleDaemon: vi.fn(),
  }),
}));

/* Peer count in hero comes from board stats (same as community page) */
vi.mock('@/lib/api/hooks/use-board-stats', () => ({
  useBoardStats: () => ({ data: { online_peers: 2 } }),
}));

/* Tracker record for the launched mint */
vi.mock('@/lib/api/hooks/use-launch-detail', () => ({
  quoteSymbolForMint: (mint: string | null | undefined) =>
    mint === '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx' ? 'STONK' : mint ? `${mint.slice(0, 4)}…` : null,
}));

/* Mock useCredits and useSocialConnections for CreditsCompactRow */
vi.mock('@/lib/api/hooks/use-credits', () => ({
  useCredits: () => ({
    data: { free_balance: 250, paid_balance: 0, total: 250, lifetime_purchased: 0, lifetime_social_granted: 0 },
    isPending: false,
  }),
}));

vi.mock('@/lib/api/hooks/use-social-connections', () => ({
  useSocialConnections: () => ({
    data: { connections: [] },
    isPending: false,
  }),
}));

const MINT = 'So11111111111111111111111111111111111111112';

const MOCK_METRICS: TokenMetricsResponse = {
  marketCapUsd: 12400,
  solRaised: 3.2,
  bondingCurvePercent: 42,
  complete: false,
  createdAt: '2026-02-15T10:00:00Z',
  imageUrl: 'https://img/test.png',
  holders: 847,
  priceUsd: 0.0042,
};

const MOCK_LAUNCH: LaunchRecord = {
  mint: MINT,
  creator_wallet: 'Wa11et',
  quote_mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  name: 'TestAgent',
  symbol: 'TAGENT',
  image_url: 'https://img/test.png',
  launch_signature: 'sig',
  fee_lamports: 1,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-01T00:00:00Z',
};

const mockTokenMetrics: HomePageState['tokenMetrics'] = { data: MOCK_METRICS, isLoading: false };

const mockToken: NonNullable<HomePageState['launchedToken']> = {
  name: 'TestAgent',
  ticker: 'TAGENT',
  imageDataUrl: null,
  contractAddr: MINT,
};

const baseProps = {
  copied: false,
  handleCopy: vi.fn(),
  showWizard: false,
  setShowWizard: vi.fn(),
  launchedToken: null as HomePageState['launchedToken'],
  tokenMetrics: mockTokenMetrics,
  launchRecord: MOCK_LAUNCH as HomePageState['launchRecord'],
  launchVerification: 'confirmed' as HomePageState['launchVerification'],
};

describe('HeroConnectedHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('connected header', () => {
    it('renders the connected heading', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.getByText('Your Agent is Live!')).toBeInTheDocument();
    });

    it('shows Free Tier badge when no token launched', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.getByText('Free Tier')).toBeInTheDocument();
    });

    it('shows Founding Agent badge when token launched', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getAllByText('Founding Agent').length).toBeGreaterThanOrEqual(1);
    });

    it('has connected-home test id', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.getByTestId('connected-home')).toBeInTheDocument();
    });

    it('shows connected peer count in header', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.getByText(/2 peers/)).toBeInTheDocument();
    });
  });

  describe('agent id', () => {
    it('renders the Agent ID display', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.getByTestId('agent-id-display')).toBeInTheDocument();
      expect(screen.getByText('Agent ID')).toBeInTheDocument();
    });

    it('copies the Agent ID on click', () => {
      const handleCopy = vi.fn();
      render(<HeroConnectedHome {...baseProps} handleCopy={handleCopy} />);
      fireEvent.click(screen.getByTestId('agent-id-copy'));
      expect(handleCopy).toHaveBeenCalledWith(TEST_PEER_ID);
    });
  });

  describe('no token fallback', () => {
    it('renders the two action cards and the subtle launch link', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.getByTestId('action-card-agent')).toHaveAttribute('href', '/chat');
      expect(screen.getByTestId('action-card-tokens')).toHaveAttribute('href', '/tokens');
      expect(screen.getByTestId('subtle-launch-link')).toBeInTheDocument();
    });

    it('opens the launch form from the subtle link', () => {
      const setShowWizard = vi.fn();
      render(<HeroConnectedHome {...baseProps} setShowWizard={setShowWizard} />);
      fireEvent.click(screen.getByTestId('subtle-launch-link'));
      expect(setShowWizard).toHaveBeenCalledWith(true);
    });

    it('renders no token card without a mint', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.queryByTestId('token-launched-card')).not.toBeInTheDocument();
    });
  });

  describe('token launched', () => {
    it('renders the token card wrapper and the tracker-backed performance card', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getByTestId('token-launched-card')).toBeInTheDocument();
      expect(screen.getByTestId('token-performance-card')).toBeInTheDocument();
    });

    it('shows the tracker symbol, the quote and the curve state', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getByTestId('perf-symbol')).toHaveTextContent('$TAGENT');
      expect(screen.getByTestId('perf-quote')).toHaveTextContent('STONK');
      expect(screen.getByTestId('badge-bonding')).toBeInTheDocument();
    });

    it('prefers the quote symbol the launch flow recorded', () => {
      render(
        <HeroConnectedHome
          {...baseProps}
          launchedToken={mockToken}
          storedLaunch={{ mint: MINT, name: 'TestAgent', symbol: 'TAGENT', quoteSymbol: 'AAPLx' }}
        />,
      );
      expect(screen.getByTestId('perf-quote')).toHaveTextContent('AAPLx');
    });

    it('falls back to the launched token identity before the tracker answers', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} launchRecord={null} launchVerification="unreachable" />);
      expect(screen.getByTestId('perf-symbol')).toHaveTextContent('$TAGENT');
      expect(screen.getByText('TestAgent')).toBeInTheDocument();
    });

    it('shows market cap and curve progress from the tracker metrics', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getByTestId('perf-market-cap')).toHaveTextContent('$12.4k');
      expect(screen.getByTestId('perf-bonding-bar')).toHaveTextContent('42%');
    });

    it('links View details and Trade to the in-app detail page', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getByTestId('perf-details')).toHaveAttribute('href', `/tokens/${MINT}`);
      expect(screen.getByTestId('perf-trade')).toHaveAttribute('href', `/tokens/${MINT}`);
    });

    it('renders the inline mint row and copies the address', () => {
      const handleCopy = vi.fn();
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} handleCopy={handleCopy} />);
      expect(screen.getByTestId('mint-inline')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('copy-contract-addr'));
      expect(handleCopy).toHaveBeenCalledWith(MINT);
    });

    it('renders Solscan and Share on X inside the links row', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      const linksRow = screen.getByTestId('links-row');
      expect(linksRow.contains(screen.getByTestId('view-solscan'))).toBe(true);
      expect(linksRow.contains(screen.getByTestId('share-x'))).toBe(true);
      expect(screen.getByTestId('share-x').getAttribute('href')).toContain(encodeURIComponent('@stonkagents'));
      expect(screen.queryByTestId('view-pumpfun')).not.toBeInTheDocument();
    });

    it('renders CreditsCompactRow in the post-token view', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getByTestId('credits-compact-row')).toBeInTheDocument();
    });

    it('does not show the launch fallback when a token exists', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.queryByTestId('action-cards')).not.toBeInTheDocument();
      expect(screen.queryByTestId('subtle-launch-link')).not.toBeInTheDocument();
    });
  });

  describe('celebration banner', () => {
    it('shows the banner on first view after the launch is bound', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.getByTestId('celebration-banner')).toBeInTheDocument();
    });

    it('states the credits the tracker granted on bind', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} creditsGranted={250} />);
      expect(screen.getByTestId('celebration-banner')).toHaveTextContent(
        'Token launched! You earned 250 AI credits + Founding Agent status.',
      );
    });

    it('does not invent a number before the claim answers', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} creditsGranted={null} />);
      expect(screen.getByTestId('celebration-banner')).toHaveTextContent('You earned AI credits');
      expect(screen.getByTestId('celebration-banner')).not.toHaveTextContent('250');
    });

    it('dismisses on click and persists the dismissal', () => {
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      fireEvent.click(screen.getByTestId('celebration-dismiss'));
      expect(screen.queryByTestId('celebration-banner')).not.toBeInTheDocument();
      expect(localStorage.getItem('stonkagents:celebration-dismissed')).toBe('true');
    });

    it('stays hidden after the localStorage flag is set', () => {
      localStorage.setItem('stonkagents:celebration-dismissed', 'true');
      render(<HeroConnectedHome {...baseProps} launchedToken={mockToken} />);
      expect(screen.queryByTestId('celebration-banner')).not.toBeInTheDocument();
    });

    it('does not show the banner when no token is launched', () => {
      render(<HeroConnectedHome {...baseProps} />);
      expect(screen.queryByTestId('celebration-banner')).not.toBeInTheDocument();
    });
  });
});
