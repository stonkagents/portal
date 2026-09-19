/**
 * Story: Home two-step flow
 * Purpose: Tests for useHomePage — the launch → agent → live phase machine,
 *          pending-launch recovery, the claim that binds a launch, and the
 *          crash/reconnect sub-states.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* === Mocks === */
let mockConnected = false;
let mockHealthStatus = 'offline';
const mockInstallWatch = { active: false, timedOut: false };
const mockStartInstallWatch = vi.fn();
const mockStopInstallWatch = vi.fn();
const mockRefresh = vi.fn();
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: mockConnected,
    health: { status: mockConnected ? 'ok' : mockHealthStatus, peerId: '', peers: 0 },
    support: 'supported',
    installWatch: mockInstallWatch,
    startInstallWatch: mockStartInstallWatch,
    stopInstallWatch: mockStopInstallWatch,
    refresh: mockRefresh,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const mockWalletConnect = vi.fn();
let mockWallet = { connected: false, publicKey: null as string | null, connect: mockWalletConnect };
vi.mock('@/lib/wallet', () => ({
  useWalletService: () => mockWallet,
}));

vi.mock('@/lib/api/hooks/use-home', () => ({
  useHome: () => ({ data: null }),
}));

let mockPeerToken: { name: string; ticker: string; imageDataUrl: null; contractAddr: string } | null = null;
vi.mock('@/lib/api/hooks/use-peer-token', () => ({
  usePeerToken: () => ({ data: mockPeerToken, isFetched: true }),
}));

let mockPendingFirst: Record<string, unknown> | null = null;
let mockByWalletFirst: Record<string, unknown> | null = null;
vi.mock('@/lib/api/hooks/use-launch-pending', () => ({
  usePendingLaunches: () => ({ data: mockPendingFirst ? [mockPendingFirst] : [], first: mockPendingFirst }),
  useLaunchesByWallet: () => ({ data: mockByWalletFirst ? [mockByWalletFirst] : [], first: mockByWalletFirst }),
}));

/* Tracker verification of a remembered launch — confirmed by default. */
const CONFIRMED_RECORD = {
  mint: 'MinT1111111111111111111111111111111111111111',
  pool_id: 'Poo1',
  creator_wallet: 'Wa11et11111111111111111111111111111111111111',
  quote_mint: 'QuoteMint',
  name: 'Agent One',
  symbol: 'AGENT',
  launch_signature: 'sig',
  fee_lamports: 1,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-01T00:00:00Z',
};
let mockLaunchDetail: { data: typeof CONFIRMED_RECORD | null; isLoading: boolean; isFetched: boolean; isError: boolean } = {
  data: CONFIRMED_RECORD,
  isLoading: false,
  isFetched: true,
  isError: false,
};
const mockUseLaunchDetail = vi.fn();
vi.mock('@/lib/api/hooks/use-launch-detail', () => ({
  useLaunchDetail: (mint: string | null) => {
    mockUseLaunchDetail(mint);
    return mint ? mockLaunchDetail : { data: null, isLoading: false, isFetched: false, isError: false };
  },
  quoteSymbolForMint: () => null,
}));

const mockClaim = vi.fn();
let mockClaimState = { status: 'idle' as string, result: null as { creditsGranted: number } | null, error: null };
vi.mock('@/lib/api/hooks/use-launch-claim', () => ({
  useLaunchClaim: () => ({ ...mockClaimState, claim: mockClaim, reset: vi.fn() }),
}));

vi.mock('@/lib/api/hooks/use-token-metrics', () => ({
  useTokenMetrics: () => ({ data: undefined, isLoading: false }),
}));

const mockStart = vi.fn();
vi.mock('@/lib/api/daemon', () => ({
  daemonControl: { start: () => mockStart() },
  DAEMON_API_V1: 'http://localhost:7841/api/v1',
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
}));

/* The setup surface (RUN-1) is polled through its own hook; the home tests run it as "no answer yet". */
vi.mock('@/components/features/onboarding/use-daemon-setup', () => ({
  useDaemonSetup: () => ({ state: 'idle', status: null, fixing: null, fixError: null, fixNote: null, applyFix: vi.fn(), refresh: vi.fn() }),
}));

const mockGetProfile = vi.fn();
const mockRecordDaemonInstall = vi.fn();
const mockPersistTokenLaunch = vi.fn();
const mockUpdateProfile = vi.fn();
vi.mock('@/lib/user-profile', () => ({
  getProfile: () => mockGetProfile(),
  recordDaemonInstall: () => mockRecordDaemonInstall(),
  recordTokenLaunch: (...args: unknown[]) => mockPersistTokenLaunch(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

vi.mock('@/components/features/token-wizard', () => ({}));

vi.mock('../useTokenSync', () => ({
  useTokenSync: () => ({ tokenMetrics: { data: null, isLoading: false, isError: false } }),
}));

vi.mock('@/lib/api/hooks/use-launch-persist', () => ({
  persistLaunchedToken: vi.fn().mockResolvedValue(undefined),
}));

/* The installer hook, with its gate: a URL only when the home page says the wallet has launched.
   The real hook's own gating is covered in lib/installer/__tests__/use-installer-downloads.test.ts. */
const WINDOWS_EXE = 'https://releases.example.test/StonkAgents-Setup-2.1.5.exe';
const mockUseInstallerDownloads = vi.fn((unlocked: boolean) => ({
  os: 'unknown' as const,
  downloadUrl: undefined,
  downloads: { macos: undefined, windows: unlocked ? WINDOWS_EXE : undefined },
  manifestState: 'ready' as const,
  retry: vi.fn(),
  unlocked,
}));
vi.mock('@/lib/installer/use-installer-downloads', () => ({
  useInstallerDownloads: (unlocked: boolean) => mockUseInstallerDownloads(unlocked),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

/* Stub clipboard */
Object.assign(navigator, {
  clipboard: { writeText: vi.fn() },
});

import { useHomePage } from '../useHomePage';
import { launchStorageKey } from '../launch-storage';

const WALLET = 'Wa11et11111111111111111111111111111111111111';
const MINT = 'MinT1111111111111111111111111111111111111111';

const TOKEN = { name: 'Agent One', ticker: 'AGENT', imageDataUrl: null, contractAddr: MINT };

describe('useHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    mockConnected = false;
    mockHealthStatus = 'offline';
    mockInstallWatch.active = false;
    mockInstallWatch.timedOut = false;
    mockWallet = { connected: false, publicKey: null, connect: mockWalletConnect };
    mockWalletConnect.mockResolvedValue(false);
    mockPendingFirst = null;
    mockByWalletFirst = null;
    mockPeerToken = null;
    mockClaimState = { status: 'idle', result: null, error: null };
    mockClaim.mockResolvedValue(null);
    mockLaunchDetail = { data: CONFIRMED_RECORD, isLoading: false, isFetched: true, isError: false };
    mockGetProfile.mockReturnValue(null);
    mockStart.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at idle install step', () => {
    const { result } = renderHook(() => useHomePage());
    expect(result.current.installStep).toBe('idle');
  });

  it('exposes reconnect attempt and max', () => {
    const { result } = renderHook(() => useHomePage());
    expect(result.current.reconnectAttempt).toBe(0);
    expect(result.current.maxReconnectAttempts).toBe(5);
  });

  describe('phase machine', () => {
    it('starts in the launch phase with no token', () => {
      const { result } = renderHook(() => useHomePage());
      expect(result.current.phase).toBe('launch');
    });

    it('stays in the launch phase when the agent is live but nothing was launched', () => {
      mockConnected = true;
      const { result, rerender } = renderHook(() => useHomePage());
      rerender();
      expect(result.current.installStep).toBe('fork');
      expect(result.current.phase).toBe('launch');
    });

    it('moves to the agent phase once a token is launched and the agent is offline', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());
      act(() => {
        result.current.setLaunchedToken(TOKEN);
      });
      expect(result.current.phase).toBe('agent');
    });

    it('never shows a launched state without a wallet (#1)', () => {
      const { result } = renderHook(() => useHomePage());
      act(() => {
        result.current.setLaunchedToken(TOKEN);
      });
      expect(result.current.launchedToken).toBeNull();
      expect(result.current.phase).toBe('launch');
      expect(result.current.existingAgent).toBeNull();
    });

    it('moves to the live phase when the token is launched and the agent is connected', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));
      mockConnected = true;
      const { result, rerender } = renderHook(() => useHomePage());
      rerender();
      expect(result.current.phase).toBe('live');
    });

    it('keeps the agent phase while the daemon is crashed', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: true });
      mockConnected = true;
      const { result, rerender } = renderHook(() => useHomePage());
      expect(result.current.phase).toBe('live');

      mockConnected = false;
      rerender();
      expect(result.current.installStep).toBe('crashed');
      expect(result.current.phase).toBe('agent');
    });
  });

  describe('installer gate (Step 2 locked until Step 1)', () => {
    it('hands out no installer URL in the launch phase, whatever the manifest says', () => {
      const { result } = renderHook(() => useHomePage());
      expect(result.current.phase).toBe('launch');
      expect(result.current.installerUnlocked).toBe(false);
      expect(mockUseInstallerDownloads).toHaveBeenLastCalledWith(false);
      expect(result.current.downloadUrl).toBeUndefined();
      expect(result.current.downloads).toEqual({ macos: undefined, windows: undefined });
    });

    it('stays locked for a connected wallet with no launch', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());
      expect(result.current.installerUnlocked).toBe(false);
      expect(mockUseInstallerDownloads).toHaveBeenLastCalledWith(false);
      expect(result.current.downloads.windows).toBeUndefined();
    });

    it('unlocks the installer once this wallet has launched', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());
      expect(result.current.installerUnlocked).toBe(false);

      act(() => {
        result.current.setLaunchedToken(TOKEN);
      });
      expect(result.current.phase).toBe('agent');
      expect(result.current.installerUnlocked).toBe(true);
      expect(mockUseInstallerDownloads).toHaveBeenLastCalledWith(true);
      expect(result.current.downloads.windows).toBe(WINDOWS_EXE);
    });

    it('unlocks from the tracker alone (a launch made on another device)', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockByWalletFirst = { ...CONFIRMED_RECORD };
      const { result } = renderHook(() => useHomePage());
      expect(result.current.installerUnlocked).toBe(true);
      expect(result.current.downloads.windows).toBe(WINDOWS_EXE);
    });

    it('locks again when the wallet disconnects', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));
      const { result, rerender } = renderHook(() => useHomePage());
      expect(result.current.installerUnlocked).toBe(true);

      mockWallet = { connected: false, publicKey: null, connect: mockWalletConnect };
      rerender();
      expect(result.current.installerUnlocked).toBe(false);
      expect(mockUseInstallerDownloads).toHaveBeenLastCalledWith(false);
      expect(result.current.downloadUrl).toBeUndefined();
      expect(result.current.downloads.windows).toBeUndefined();
    });
  });

  describe('per-wallet launch persistence', () => {
    it('writes the launch under stonkagents:launch:<wallet>', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());

      act(() => {
        result.current.setLaunchedToken(TOKEN);
      });

      const raw = localStorage.getItem(launchStorageKey(WALLET));
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string)).toMatchObject({ mint: MINT, symbol: 'AGENT' });
    });

    it('hydrates the stored launch for the connected wallet and lands in Step 2', () => {
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.storedLaunch?.mint).toBe(MINT);
      expect(result.current.launchedToken?.contractAddr).toBe(MINT);
      expect(result.current.phase).toBe('agent');
    });

    it('ignores a launch stored under a different wallet', () => {
      localStorage.setItem(launchStorageKey('someone-else'), JSON.stringify({ mint: MINT, name: 'x', symbol: 'X' }));
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.storedLaunch).toBeNull();
      expect(result.current.phase).toBe('launch');
    });

    it('drops the launch on disconnect and does not carry it to the next wallet (#1)', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result, rerender } = renderHook(() => useHomePage());
      act(() => {
        result.current.setLaunchedToken(TOKEN);
      });
      expect(result.current.phase).toBe('agent');

      mockWallet = { connected: false, publicKey: null, connect: mockWalletConnect };
      rerender();
      expect(result.current.launchedToken).toBeNull();
      expect(result.current.phase).toBe('launch');

      mockWallet = { connected: true, publicKey: 'Wa11etB', connect: mockWalletConnect };
      rerender();
      expect(result.current.launchedToken).toBeNull();
      expect(result.current.storedLaunch).toBeNull();
      expect(result.current.phase).toBe('launch');
    });
  });

  describe('one agent per wallet (#21)', () => {
    it('exposes the existing agent with a link to its token page', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));

      const { result } = renderHook(() => useHomePage());

      expect(result.current.existingAgent).toEqual({ mint: MINT, name: 'Agent One', symbol: 'AGENT', href: `/tokens/${MINT}` });
    });

    it('openLaunch refuses the wizard for a wallet that already has an agent', async () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));

      const { result } = renderHook(() => useHomePage());
      let opened = true;
      await act(async () => {
        opened = await result.current.openLaunch();
      });
      expect(opened).toBe(false);
      expect(result.current.showWizard).toBe(false);
    });

    it('openLaunch opens the wizard for a wallet with no agent', async () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());
      await act(async () => {
        await result.current.openLaunch();
      });
      expect(result.current.showWizard).toBe(true);
    });

    it('openLaunch connects first when disconnected and stops when the prompt is dismissed (#4)', async () => {
      const { result } = renderHook(() => useHomePage());
      await act(async () => {
        await result.current.openLaunch();
      });
      expect(mockWalletConnect).toHaveBeenCalledTimes(1);
      expect(result.current.showWizard).toBe(false);
    });

    it('openLaunch continues into the wizard once the prompt connects a wallet (#4)', async () => {
      mockWalletConnect.mockResolvedValue(true);
      const { result } = renderHook(() => useHomePage());
      await act(async () => {
        await result.current.openLaunch();
      });
      expect(result.current.showWizard).toBe(true);
    });
  });

  describe('the local agent token as a hint', () => {
    const PEER_TOKEN = { name: 'Agent One', ticker: 'AGENT', imageDataUrl: null, contractAddr: MINT };

    it('adopts the bound token only when the tracker names this wallet as creator', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockConnected = true;
      mockPeerToken = PEER_TOKEN;

      const { result, rerender } = renderHook(() => useHomePage());
      rerender();

      expect(result.current.storedLaunch?.mint).toBe(MINT);
      expect(result.current.phase).toBe('live');
    });

    it("ignores another wallet's bound token", () => {
      mockWallet = { connected: true, publicKey: 'Wa11etB', connect: mockWalletConnect };
      mockConnected = true;
      mockPeerToken = PEER_TOKEN;

      const { result, rerender } = renderHook(() => useHomePage());
      rerender();

      expect(result.current.storedLaunch).toBeNull();
      expect(result.current.launchedToken).toBeNull();
      expect(result.current.phase).toBe('launch');
    });
  });

  describe('pending-launch recovery', () => {
    it('adopts the tracker launch and persists it for this wallet', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockPendingFirst = {
        mint: MINT,
        name: 'Agent One',
        symbol: 'AGENT',
        image_url: 'https://img/1.png',
        quote_mint: 'QuoteMint',
        created_at: '2026-09-01T00:00:00Z',
      };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.storedLaunch?.mint).toBe(MINT);
      expect(result.current.storedLaunch?.quoteMint).toBe('QuoteMint');
      expect(result.current.phase).toBe('agent');
      expect(JSON.parse(localStorage.getItem(launchStorageKey(WALLET)) as string)).toMatchObject({ mint: MINT });
    });

    it('does nothing without a connected wallet', () => {
      mockPendingFirst = { mint: MINT, name: 'Agent One', symbol: 'AGENT' };
      const { result } = renderHook(() => useHomePage());
      expect(result.current.storedLaunch).toBeNull();
      expect(result.current.phase).toBe('launch');
    });
  });

  describe('a launch the agent already claimed (by-wallet)', () => {
    /* The trap: `pending` stops listing a launch once the daemon claims it, so a
       fresh browser used to be offered a second launch the tracker refuses with 409. */
    const CLAIMED = { ...CONFIRMED_RECORD, peer_id: 'peer-1', bound_at: '2026-09-02T00:00:00Z', agentBound: true };

    it('lands in Step 2 with the claimed launch, marked bound, and shows it as the existing agent', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockByWalletFirst = CLAIMED;
      mockPendingFirst = null;

      const { result } = renderHook(() => useHomePage());

      expect(result.current.phase).toBe('agent');
      expect(result.current.storedLaunch).toMatchObject({ mint: MINT, bound: true });
      expect(result.current.existingAgent).toEqual({ mint: MINT, name: 'Agent One', symbol: 'AGENT', href: `/tokens/${MINT}` });
      expect(JSON.parse(localStorage.getItem(launchStorageKey(WALLET)) as string)).toMatchObject({ mint: MINT, bound: true });
    });

    it('refuses the wizard and does not claim again when the agent comes online', async () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockByWalletFirst = CLAIMED;
      mockConnected = true;

      const { result } = renderHook(() => useHomePage());
      let opened = true;
      await act(async () => {
        opened = await result.current.openLaunch();
      });

      expect(opened).toBe(false);
      expect(result.current.showWizard).toBe(false);
      expect(mockClaim).not.toHaveBeenCalled();
    });

    it('names the existing agent from the tracker before anything this browser remembers', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: 'OtherMint', name: 'Stale', symbol: 'STALE' }));
      mockByWalletFirst = CLAIMED;

      const { result } = renderHook(() => useHomePage());

      expect(result.current.existingAgent?.mint).toBe(MINT);
    });

    it('prefers the by-wallet answer over pending and trusts it without a second lookup', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockByWalletFirst = CLAIMED;
      mockPendingFirst = { ...CONFIRMED_RECORD, mint: 'PendingMint' };
      mockLaunchDetail = { data: null, isLoading: true, isFetched: false, isError: false };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.storedLaunch?.mint).toBe(MINT);
      expect(result.current.launchVerification).toBe('confirmed');
      expect(result.current.launchRecord?.mint).toBe(MINT);
    });

    it('still recovers an unclaimed launch from pending when by-wallet has nothing (older tracker)', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockByWalletFirst = null;
      mockPendingFirst = { ...CONFIRMED_RECORD };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.storedLaunch).toMatchObject({ mint: MINT });
      expect(result.current.storedLaunch?.bound).toBeUndefined();
      expect(result.current.phase).toBe('agent');
    });
  });

  describe('verifying a remembered launch', () => {
    const LEGACY = { mint: MINT, name: 'Jail', symbol: 'JAIL' };

    it('holds Step 1 in a checking state until the tracker answers', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify(LEGACY));
      mockLaunchDetail = { data: null, isLoading: true, isFetched: false, isError: false };

      const { result } = renderHook(() => useHomePage());

      expect(mockUseLaunchDetail).toHaveBeenCalledWith(MINT);
      expect(result.current.launchVerification).toBe('checking');
      expect(result.current.phase).toBe('launch');
    });

    it('forgets a stored launch the tracker does not know (404) and lands on the Launchpad', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify(LEGACY));
      mockLaunchDetail = { data: null, isLoading: false, isFetched: true, isError: false };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.phase).toBe('launch');
      expect(result.current.storedLaunch).toBeNull();
      expect(result.current.launchedToken).toBeNull();
      expect(localStorage.getItem(launchStorageKey(WALLET))).toBeNull();
      expect(mockClaim).not.toHaveBeenCalled();
    });

    it('also clears a stale profile copy of a launch the tracker no longer knows', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify(LEGACY));
      mockGetProfile.mockReturnValue({ launchedToken: { ...TOKEN, ticker: 'JAIL' } });
      mockLaunchDetail = { data: null, isLoading: false, isFetched: true, isError: false };

      const { result } = renderHook(() => useHomePage());

      expect(mockUpdateProfile).toHaveBeenCalledWith({ launchedToken: null, launchWalletAddress: null });
      expect(result.current.launchedToken).toBeNull();
      expect(result.current.phase).toBe('launch');
    });

    it('opens Step 2 with the tracker record once confirmed, and upgrades a legacy record', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify(LEGACY));

      const { result } = renderHook(() => useHomePage());

      expect(result.current.launchVerification).toBe('confirmed');
      expect(result.current.launchRecord?.pool_id).toBe('Poo1');
      expect(result.current.phase).toBe('agent');
      expect(result.current.storedLaunch).toMatchObject({ poolId: 'Poo1', quoteMint: 'QuoteMint', legacy: false });
      expect(JSON.parse(localStorage.getItem(launchStorageKey(WALLET)) as string)).toMatchObject({ poolId: 'Poo1' });
    });

    it('keeps the launch in a degraded state when the tracker is unreachable and does not claim', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify(LEGACY));
      mockLaunchDetail = { data: null, isLoading: false, isFetched: true, isError: true };
      mockConnected = true;

      const { result, rerender } = renderHook(() => useHomePage());
      rerender();

      expect(result.current.launchVerification).toBe('unreachable');
      expect(result.current.launchRecord).toBeNull();
      expect(result.current.phase).toBe('live');
      expect(result.current.storedLaunch?.mint).toBe(MINT);
      expect(localStorage.getItem(launchStorageKey(WALLET))).not.toBeNull();
      expect(mockClaim).not.toHaveBeenCalled();
    });

    it('trusts a launch the tracker itself recovered without a second lookup', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      mockPendingFirst = { ...CONFIRMED_RECORD };
      mockLaunchDetail = { data: null, isLoading: true, isFetched: false, isError: false };

      const { result } = renderHook(() => useHomePage());

      expect(result.current.launchVerification).toBe('confirmed');
      expect(result.current.launchRecord?.mint).toBe(MINT);
      expect(result.current.phase).toBe('agent');
    });
  });

  describe('binding the launch', () => {
    it('claims the launch when the agent comes online', async () => {
      /* waitFor needs real timers to poll. */
      vi.useRealTimers();
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));
      mockClaim.mockResolvedValue({ launch: null, creditsGranted: 250, alreadyBound: false });
      mockConnected = true;

      const { result, rerender } = renderHook(() => useHomePage());
      rerender();

      await waitFor(() => expect(mockClaim).toHaveBeenCalledWith(MINT));
      await waitFor(() => expect(result.current.storedLaunch?.bound).toBe(true));
      expect(result.current.creditsGranted).toBe(250);
      expect(JSON.parse(localStorage.getItem(launchStorageKey(WALLET)) as string)).toMatchObject({
        bound: true,
        creditsGranted: 250,
      });
    });

    it('does not claim while the agent is offline', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT' }));

      renderHook(() => useHomePage());

      expect(mockClaim).not.toHaveBeenCalled();
    });

    it('does not re-claim a launch already marked bound', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      localStorage.setItem(
        launchStorageKey(WALLET),
        JSON.stringify({ mint: MINT, name: 'Agent One', symbol: 'AGENT', bound: true, creditsGranted: 250 }),
      );
      mockConnected = true;

      const { result, rerender } = renderHook(() => useHomePage());
      rerender();

      expect(mockClaim).not.toHaveBeenCalled();
      expect(result.current.creditsGranted).toBe(250);
    });
  });

  describe('daemon context reactive transitions', () => {
    it('transitions idle → fork when connected becomes true', () => {
      const { result, rerender } = renderHook(() => useHomePage());
      expect(result.current.installStep).toBe('idle');

      mockConnected = true;
      rerender();
      expect(result.current.installStep).toBe('fork');
    });

    it('transitions fork → crashed when disconnected and previously installed', () => {
      mockConnected = true;
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: true });
      const { result, rerender } = renderHook(() => useHomePage());
      expect(result.current.installStep).toBe('fork');

      mockConnected = false;
      rerender();
      expect(result.current.installStep).toBe('crashed');
    });

    it('remembers when the agent last answered so the crashed hero can show "Last seen"', () => {
      mockConnected = true;
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: true });
      const before = Date.now();
      const { result, rerender } = renderHook(() => useHomePage());
      expect(result.current.lastSeenAt).toBeNull();

      mockConnected = false;
      rerender();
      expect(result.current.installStep).toBe('crashed');
      expect(result.current.lastSeenAt).toBeGreaterThanOrEqual(before);
      expect(result.current.lastSeenAt).toBeLessThanOrEqual(Date.now());
    });

    it('transitions fork → idle when disconnected and never installed', () => {
      mockConnected = true;
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: false });
      const { result, rerender } = renderHook(() => useHomePage());
      expect(result.current.installStep).toBe('fork');

      mockConnected = false;
      rerender();
      expect(result.current.installStep).toBe('idle');
    });

    it('records daemon install on fork transition', () => {
      const { rerender } = renderHook(() => useHomePage());
      mockConnected = true;
      rerender();
      expect(mockRecordDaemonInstall).toHaveBeenCalled();
    });
  });

  describe('handleRestart', () => {
    it('sets installStep to reconnecting', async () => {
      mockConnected = true;
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: true });
      const { result, rerender } = renderHook(() => useHomePage());

      // Get to crashed state
      mockConnected = false;
      rerender();
      expect(result.current.installStep).toBe('crashed');

      // Restart
      await act(async () => {
        await result.current.handleRestart();
      });
      expect(result.current.installStep).toBe('reconnecting');
      expect(mockStart).toHaveBeenCalled();
    });
  });

  describe('handleCancelReconnect', () => {
    it('sets installStep back to crashed', async () => {
      mockConnected = true;
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: true });
      const { result, rerender } = renderHook(() => useHomePage());

      // Get to crashed → reconnecting
      mockConnected = false;
      rerender();
      await act(async () => {
        await result.current.handleRestart();
      });
      expect(result.current.installStep).toBe('reconnecting');

      // Cancel
      act(() => {
        result.current.handleCancelReconnect();
      });
      expect(result.current.installStep).toBe('crashed');
    });
  });

  describe('setLaunchedToken', () => {
    it('persists the token to the user profile keyed by the wallet', () => {
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());
      act(() => {
        result.current.setLaunchedToken(TOKEN);
      });
      expect(result.current.launchedToken).toEqual(TOKEN);
      expect(mockPersistTokenLaunch).toHaveBeenCalledWith(TOKEN, WALLET);
    });

    it('does not persist when setting to null', () => {
      const { result } = renderHook(() => useHomePage());
      act(() => {
        result.current.setLaunchedToken(null);
      });
      expect(mockPersistTokenLaunch).not.toHaveBeenCalled();
    });
  });

  describe('profile copy (#1)', () => {
    it('never hydrates a launch from the unkeyed profile copy', () => {
      const token = { name: 'Saved', ticker: 'SAV', imageDataUrl: null, contractAddr: 'xxx' };
      mockGetProfile.mockReturnValue({ launchedToken: token, launchWalletAddress: null });
      mockWallet = { connected: true, publicKey: WALLET, connect: mockWalletConnect };
      const { result } = renderHook(() => useHomePage());
      expect(result.current.launchedToken).toBeNull();
      expect(result.current.phase).toBe('launch');
    });
  });

  describe('install detection (PERF-3)', () => {
    it('starts the daemon install watch only from the Download click', () => {
      const { result } = renderHook(() => useHomePage());
      expect(mockStartInstallWatch).not.toHaveBeenCalled();

      act(() => {
        result.current.handleDownload();
      });
      expect(result.current.installStep).toBe('waiting');
      expect(mockStartInstallWatch).toHaveBeenCalledTimes(1);
    });

    it('moves to detecting while the daemon answers but is not healthy, then live when connected', () => {
      const { result, rerender } = renderHook(() => useHomePage());
      act(() => {
        result.current.handleDownload();
      });

      mockHealthStatus = 'starting';
      rerender();
      expect(result.current.installStep).toBe('detecting');

      mockConnected = true;
      rerender();
      expect(result.current.installStep).toBe('live');
      expect(mockRecordDaemonInstall).toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.installStep).toBe('fork');
    });

    it('reports the timeout from the watch and retries it manually', () => {
      const { result, rerender } = renderHook(() => useHomePage());
      act(() => {
        result.current.handleDownload();
      });
      expect(result.current.installTimeout).toBe(false);

      mockInstallWatch.timedOut = true;
      rerender();
      expect(result.current.installTimeout).toBe(true);

      act(() => {
        result.current.setInstallTimeout(false);
      });
      expect(mockStartInstallWatch).toHaveBeenCalledTimes(2);
    });

    it('reconnect attempts ask the provider to probe', async () => {
      mockConnected = true;
      mockGetProfile.mockReturnValue({ hasInstalledDaemon: true });
      const { result, rerender } = renderHook(() => useHomePage());
      mockConnected = false;
      rerender();
      await act(async () => {
        await result.current.handleRestart();
      });
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
