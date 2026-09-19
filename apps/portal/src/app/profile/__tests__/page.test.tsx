/**
 * Purpose: Tests for profile page loading/error/success states
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures mock values exist before vi.mock factories run
const mockConfig = vi.hoisted(() => ({
  useRealDaemon: true,
  daemonUrl: 'http://localhost:7841/api/v1',
  apiBaseUrl: 'http://localhost:7842',
}));
vi.mock('@/lib/config/app.config', () => ({ appConfig: mockConfig }));

const mockUseProfile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/hooks/use-profile', () => ({ useProfile: mockUseProfile }));

const mockPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockDaemon = vi.hoisted(() => ({
  connected: true,
  health: { peerId: 'test-peer', status: 'connected' },
  refresh: vi.fn(),
}));
/* The display name is read through its own hook; these tests are about the id and the rest of the surface. */
vi.mock('@/lib/api/hooks/use-agent-identity', () => ({
  useAgentIdentity: () => ({ data: null, isLoading: false, isFetched: true, isError: false }),
}));

vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const mockGetProfile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/user-profile/storage', () => ({ getProfile: mockGetProfile }));

/* The launched token is wallet-keyed (#1): the page reads the per-wallet launch record, never the profile field. */
const mockWallet = vi.hoisted(() => ({ connected: false, publicKey: null as string | null }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => mockWallet }));
const mockReadStoredLaunch = vi.hoisted(() => vi.fn());
vi.mock('@/app/_components/launch-storage', () => ({ readStoredLaunch: mockReadStoredLaunch }));

const mockUseTokenMetrics = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/hooks/use-token-metrics', () => ({ useTokenMetrics: mockUseTokenMetrics }));
vi.mock('../_components/BoardReputationCard', () => ({ BoardReputationCard: () => null }));

import { ApiRequestError } from '@/lib/api/errors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import ProfilePage from '../page';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

/** A successful useProfile() result for a connected daemon — the page has no mock-data fallback. */
function loadedProfile(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      profile: { name: 'claw-test-abc1', rank: 'gold', agentId: '12D3KooWTest', isOnline: true },
      stats: { clout: 72, cloutRank: 'Top 8%', drops: 5, library: 5, uptime: '3d 2h', weeklyBonus: '+50 credits / week' },
      eigenTrust: [
        { name: 'Bandwidth', value: 6.0, weight: 40, color: 'green' },
        { name: 'Quality', value: 7.5, weight: 30, color: 'blue' },
        { name: 'Security', value: 8.0, weight: 20, color: 'yellow' },
        { name: 'Citizenship', value: 5.0, weight: 10, color: 'green' },
      ],
      badges: [
        { icon: 'zap', label: 'Early Adopter', desc: 'Joined within the first week of launch', status: 'earned' },
        { icon: 'info', label: 'Mystery Badge', desc: '', status: 'locked' },
      ],
      drops: [{ name: 'test.vec', type: '.vec', peers: 10 }],
      activity: [{ id: 'a-0', icon: 'upload', text: 'Shared test.vec', timestamp: '2h ago', color: 'green' }],
      ...overrides,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.useRealDaemon = true;
    mockDaemon.connected = true;
    mockGetProfile.mockReturnValue(null);
    mockWallet.connected = false;
    mockWallet.publicKey = null;
    mockReadStoredLaunch.mockReturnValue(null);
    mockUseTokenMetrics.mockReturnValue({ data: undefined });
  });

  it('shows skeleton loading state in real daemon mode', () => {
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });

    render(createElement(ProfilePage), { wrapper: createWrapper() });
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
    expect(screen.getByTestId('profile-loading').className).toContain('animate-pulse');
  });

  it('shows error state with retry button in real daemon mode', () => {
    const mockRefetch = vi.fn();
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: mockRefetch });

    render(createElement(ProfilePage), { wrapper: createWrapper() });
    expect(screen.getByTestId('profile-error')).toBeInTheDocument();
    const retryButton = screen.getByTestId('profile-retry-button');
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('shows profile-specific error message for NOT_FOUND via context override', () => {
    const notFoundError = new ApiRequestError(404, { code: 'NOT_FOUND', message: 'peer not found' });
    mockUseProfile.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: notFoundError,
      refetch: vi.fn(),
    });

    render(<ProfilePage />);
    expect(screen.getByTestId('profile-error-title')).toHaveTextContent('Profile not found');
    expect(screen.getByTestId('profile-error-description')).toHaveTextContent(
      "We couldn't find your Agent profile. Your daemon might need to register first.",
    );
  });

  it('shows the error state instead of mock data when the query yields no profile', () => {
    // The mock-data fallback was removed: with useRealDaemon=false the query is disabled and
    // resolves with no data, and the page must not render the old mock profile (clout 847).
    mockConfig.useRealDaemon = false;
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });

    render(createElement(ProfilePage), { wrapper: createWrapper() });
    expect(screen.getByTestId('profile-error')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page')).not.toBeInTheDocument();
    expect(screen.queryByText('847')).not.toBeInTheDocument();
  });

  it('shows the offline state and retries via the daemon when the daemon is disconnected', () => {
    mockDaemon.connected = false;
    const mockRefetch = vi.fn();
    mockUseProfile.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('fetch failed'),
      refetch: mockRefetch,
    });

    render(createElement(ProfilePage), { wrapper: createWrapper() });
    expect(screen.getByTestId('profile-offline')).toBeInTheDocument();
    expect(screen.getByTestId('agent-offline-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-error')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ac-connect-daemon'));
    expect(mockDaemon.refresh).toHaveBeenCalledOnce();
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('renders real API data in success state', () => {
    mockUseProfile.mockReturnValue(loadedProfile());

    render(createElement(ProfilePage), { wrapper: createWrapper() });
    expect(screen.getByTestId('profile-page')).toBeInTheDocument();
    expect(screen.getByTestId('profile-stats')).toBeInTheDocument();
    expect(screen.getByTestId('profile-eigentrust')).toBeInTheDocument();
    expect(screen.getByTestId('profile-badges')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-error')).not.toBeInTheDocument();

    // Verify API data rendered — not fallback mock data
    expect(screen.getByText('72')).toBeInTheDocument(); // Clout from API, not 847 from mock
    expect(screen.getByText('Top 8%')).toBeInTheDocument(); // cloutRank from API
    expect(screen.getByTestId('profile-rep-bonus')).toHaveTextContent('+50 credits / week (Gold tier)');

    // Badge accessibility — aria-label conveys status; description text is visible
    const badge = screen.getByLabelText('Early Adopter: earned');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Joined within the first week of launch');
    // A badge without metadata gets the fallback description
    expect(screen.getByLabelText('Mystery Badge: locked')).toHaveTextContent('No description available');
  });

  it('shows "No agent launched" CTA when user has no launched agent', () => {
    mockGetProfile.mockReturnValue(null);
    mockUseProfile.mockReturnValue({
      data: {
        profile: { name: 'claw-test', rank: 'new', agentId: '12D3Test', isOnline: true },
        stats: { clout: 0, cloutRank: 'Top 99%', drops: 0, library: 0, uptime: '0m', weeklyBonus: null },
        eigenTrust: [],
        badges: [],
        drops: [],
        activity: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProfilePage />);
    expect(screen.getByText('No agent launched yet.')).toBeInTheDocument();
    expect(screen.getByTestId('profile-launch-token')).toBeInTheDocument();
  });

  it('shows real token data when the connected wallet has launched a token', () => {
    mockWallet.connected = true;
    mockWallet.publicKey = 'Wa11et';
    mockReadStoredLaunch.mockImplementation((wallet: string | null) =>
      wallet === 'Wa11et' ? { mint: 'So1abc123', name: 'TestAgent', symbol: 'TAGENT' } : null,
    );
    mockUseTokenMetrics.mockReturnValue({
      data: {
        priceUsd: 0.0042,
        marketCapUsd: 42800,
        holders: 89,
        solRaised: 1.5,
        bondingCurvePercent: 45,
        complete: false,
        createdAt: null,
        imageUrl: null,
      },
    });
    mockUseProfile.mockReturnValue({
      data: {
        profile: { name: 'claw-test', rank: 'gold', agentId: '12D3Test', isOnline: true },
        stats: { clout: 72, cloutRank: 'Top 8%', drops: 5, library: 5, uptime: '3d', weeklyBonus: '+50 credits / week' },
        eigenTrust: [],
        badges: [],
        drops: [],
        activity: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProfilePage />);
    expect(mockReadStoredLaunch).toHaveBeenCalledWith('Wa11et');
    expect(screen.getByText('$TAGENT')).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument(); // holders from useTokenMetrics
    expect(screen.getByTestId('profile-token-link')).toHaveAttribute('href', '/tokens/So1abc123');
  });

  it('navigates to /settings when Edit Settings is clicked', () => {
    mockUseProfile.mockReturnValue(loadedProfile());

    render(<ProfilePage />);
    fireEvent.click(screen.getByTestId('profile-edit-settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('links the hero action to the community board (the board has no author filter)', () => {
    mockUseProfile.mockReturnValue(loadedProfile());

    render(<ProfilePage />);
    expect(screen.queryByText('My Posts')).not.toBeInTheDocument();
    const action = screen.getByTestId('profile-community');
    expect(action).toHaveTextContent('Community');
    fireEvent.click(action);
    expect(mockPush).toHaveBeenCalledWith('/community');
  });

  it('navigates to /tokens when Launch a Token is clicked', () => {
    mockGetProfile.mockReturnValue(null);
    mockUseProfile.mockReturnValue({
      data: {
        profile: { name: 'claw-test', rank: 'new', agentId: '12D3Test', isOnline: true },
        stats: { clout: 0, cloutRank: 'Top 99%', drops: 0, library: 0, uptime: '0m', weeklyBonus: null },
        eigenTrust: [],
        badges: [],
        drops: [],
        activity: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProfilePage />);
    fireEvent.click(screen.getByTestId('profile-launch-token'));
    expect(mockPush).toHaveBeenCalledWith('/tokens');
  });
});
