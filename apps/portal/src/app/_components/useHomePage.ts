/**
 * Purpose: Custom hook encapsulating all stateful logic for the landing page.
 *
 * The home page is a two-step product:
 *   Step 1 "Launchpad"      — connect a wallet and launch a token against $STONK.
 *   Step 2 "Run your agent" — install/spawn the agent, which binds to that token.
 *
 * Top-level phases: `launch` → `agent` → `live`. The install state machine
 * (idle/waiting/detecting/live/fork) and the crashed/reconnecting states are
 * sub-states of `agent` and `live`. Daemon health comes from DaemonProvider,
 * which owns every localhost request; nothing here polls (PERF-3).
 *
 * Launch state is keyed to the connected wallet and nothing else (#1): the
 * tracker's launches for that wallet (`by-wallet`, claimed or not, with
 * `pending` as the fallback for an older tracker), the per-wallet localStorage
 * record, and — only after the tracker confirms the creator — the token the
 * local agent reports. No wallet means no launched state.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { daemonControl } from '@/lib/api/daemon';
import { useDaemon } from '@/providers/DaemonProvider';
import { useWalletService } from '@/lib/wallet';
import { useHome } from '@/lib/api/hooks/use-home';
import { usePeerToken } from '@/lib/api/hooks/use-peer-token';
import { useLaunchesByWallet, usePendingLaunches } from '@/lib/api/hooks/use-launch-pending';
import { useLaunchClaim } from '@/lib/api/hooks/use-launch-claim';
import { useLaunchDetail } from '@/lib/api/hooks/use-launch-detail';
import { launchKeys, type LaunchRecord } from '@/lib/api/launches';
import type { TokenMetricsResponse } from '@/lib/types/backend';
import { queryKeys } from '@/lib/api/keys';
import { TOKEN_LIST_LIMIT } from '@/lib/api/tokens-list';
import { useToast } from '@/providers/ToastProvider';
import { getProfile, updateProfile, recordDaemonInstall, recordTokenLaunch as persistTokenLaunch } from '@/lib/user-profile';
import { persistLaunchedToken } from '@/lib/api/hooks/use-launch-persist';
import { useTokenSync } from './useTokenSync';
import { useTokenMetrics } from '@/lib/api/hooks/use-token-metrics';
import {
  readStoredLaunch,
  writeStoredLaunch,
  clearStoredLaunch,
  markStoredLaunchBound,
  isLegacyStoredLaunch,
  type StoredLaunch,
} from './launch-storage';
import type { LaunchedToken } from '@/components/features/token-wizard';
import { useInstallerDownloads } from '@/lib/installer/use-installer-downloads';
import { useDaemonSetup } from '@/components/features/onboarding/use-daemon-setup';

export type InstallStep =
  | 'idle' // Pre-install (first visit, no daemon)
  | 'waiting' // User clicked Download, watching for the daemon
  | 'detecting' // Daemon process found, checking health
  | 'live' // Daemon healthy — celebration (3s hold)
  | 'fork' // Connected — show token launch / dashboard
  | 'crashed' // Daemon went offline (was previously connected)
  | 'reconnecting'; // Auto-reconnecting after crash

/** Step 1 Launchpad → Step 2 Run your agent → done. */
export type HomePhase = 'launch' | 'agent' | 'live';

/** Where Step 2 is: Install → Permissions → Live (RUN-1). */
export type AgentStage = 'install' | 'permissions' | 'live';

/**
 * Whether the tracker vouches for the remembered launch.
 * `missing` (404) forgets it; `unreachable` keeps it in a degraded state.
 */
type LaunchVerification = 'none' | 'checking' | 'confirmed' | 'missing' | 'unreachable';

/** The agent this wallet already launched (#21): one per wallet, first launch wins. */
export interface ExistingAgent {
  mint: string;
  name: string;
  symbol: string;
  /** Token page for the agent. */
  href: string;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 3000;

function toStoredLaunch(token: LaunchedToken): StoredLaunch {
  return {
    mint: token.contractAddr,
    name: token.name,
    symbol: token.ticker,
    ...(token.imageUrl ? { imageUrl: token.imageUrl } : {}),
    ...(token.imageThumbUrl ? { imageThumbUrl: token.imageThumbUrl } : {}),
    ...(token.quoteMint ? { quoteMint: token.quoteMint } : {}),
    ...(token.quoteSymbol ? { quoteSymbol: token.quoteSymbol } : {}),
    ...(token.poolId ? { poolId: token.poolId } : {}),
    launchedAt: new Date().toISOString(),
  };
}

/** True once an agent has claimed the launch, whichever spelling the tracker used. */
function isBoundRecord(record: LaunchRecord): boolean {
  return record.agentBound ?? (Boolean(record.peerId ?? record.peer_id) || record.status === 'bound');
}

function recordToStoredLaunch(record: LaunchRecord): StoredLaunch {
  const poolId = record.pool_id ?? record.poolId;
  const quoteMint = record.quote_mint ?? record.quoteMint;
  const imageUrl = record.image_url ?? record.imageUrl;
  const imageThumbUrl = record.imageThumbUrl ?? record.image_thumb_url;
  const launchedAt = record.created_at ?? record.createdAt;
  return {
    mint: record.mint,
    name: record.name,
    symbol: record.symbol,
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageThumbUrl ? { imageThumbUrl } : {}),
    ...(quoteMint ? { quoteMint } : {}),
    ...(poolId ? { poolId } : {}),
    ...(launchedAt ? { launchedAt } : {}),
    // A launch another machine already claimed is not claimed again from here.
    ...(isBoundRecord(record) ? { bound: true } : {}),
  };
}

function creatorOf(record: LaunchRecord): string | null {
  return record.creator_wallet ?? record.creatorWallet ?? null;
}

export function useHomePage() {
  const queryClient = useQueryClient();
  const { connected, health, support: agentSupport, installWatch, startInstallWatch, stopInstallWatch, refresh } = useDaemon();
  const wallet = useWalletService();
  const { data: homeData } = useHome();
  const peerId = connected && health?.peerId ? health.peerId : null;
  const { data: peerToken } = usePeerToken(peerId);
  const visionStats = homeData?.visionStats ?? [];
  const trendingAssets = homeData?.trendingAssets ?? [];
  const mostInstalled = homeData?.mostInstalled ?? [];
  const recentlyShared = homeData?.recentlyShared ?? [];

  const walletAddress = wallet.connected ? wallet.publicKey : null;

  const [ddTab, setDdTab] = useState<'built' | 'share' | 'how' | 'rep'>('built');
  const [platform, setPlatform] = useState('claude');
  const [copied, setCopied] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  /** The token launched in this session, from the wizard. Cleared with the wallet. */
  const [launchedToken, setLaunchedToken] = useState<LaunchedToken | null>(null);
  const [storedLaunch, setStoredLaunch] = useState<StoredLaunch | null>(null);
  const [installStep, setInstallStep] = useState<InstallStep>('idle');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  /** When the agent last answered a health check this page load; the crashed hero shows it as "Last seen". */
  const lastSeenRef = useRef<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const installStartRef = useRef<number>(0);
  const reconnectRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ==============================================================
     STEP 1 → STEP 2: the launch this wallet already made
     ============================================================== */

  /* Per-wallet localStorage record — the fast path on a return visit. A wallet
     switch or a disconnect drops everything remembered for the previous one. */
  useEffect(() => {
    setLaunchedToken(null);
    setStoredLaunch(readStoredLaunch(walletAddress));
  }, [walletAddress]);

  /* Tracker recovery — a launch made on another device still lands in Step 2.
     `by-wallet` lists every launch, claimed or not: a launch the agent already
     claimed elsewhere must still count, or this wallet is offered a second one
     the tracker refuses. `pending` (unclaimed only) covers an older tracker. */
  const { first: byWalletLaunch } = useLaunchesByWallet(walletAddress);
  const { first: pendingLaunch } = usePendingLaunches(walletAddress);
  const trackerLaunch = byWalletLaunch ?? pendingLaunch;

  useEffect(() => {
    if (!walletAddress || !trackerLaunch) return;
    setStoredLaunch(prev => {
      if (prev && prev.mint === trackerLaunch.mint) return prev;
      const next = recordToStoredLaunch(trackerLaunch);
      writeStoredLaunch(walletAddress, next);
      return next;
    });
  }, [walletAddress, trackerLaunch]);

  /* ==============================================================
     DERIVED: the token in play
     ============================================================== */
  const storedMint = storedLaunch?.mint ?? null;
  const storedName = storedLaunch?.name ?? '';
  const storedSymbol = storedLaunch?.symbol ?? '';
  const storedImage = storedLaunch?.imageUrl ?? '';

  /* Memoised so downstream effects (token sync, metrics) see a stable reference.
     Without a wallet there is no token in play, whatever is in memory. */
  const activeToken = useMemo<LaunchedToken | null>(() => {
    if (!walletAddress) return null;
    if (launchedToken) return launchedToken;
    if (!storedMint) return null;
    return {
      name: storedName,
      ticker: storedSymbol,
      imageDataUrl: null,
      contractAddr: storedMint,
      ...(storedImage ? { imageUrl: storedImage } : {}),
    };
  }, [walletAddress, launchedToken, storedMint, storedName, storedSymbol, storedImage]);

  /* ==============================================================
     VERIFY: a remembered launch is only a claim until the tracker confirms it
     ============================================================== */
  const rememberedMint = activeToken?.contractAddr ?? null;
  /* The local agent's bound token is a hint for a wallet with nothing remembered
     (fresh browser on the machine that ran the claim). It is adopted only once
     the tracker says this wallet created it. */
  const hintMint = walletAddress && !rememberedMint && !trackerLaunch ? (peerToken?.contractAddr ?? null) : null;
  /* A launch the tracker itself just handed us needs no second opinion. */
  const trackerBacked = !!rememberedMint && trackerLaunch?.mint === rememberedMint;
  const launchDetail = useLaunchDetail(rememberedMint ?? hintMint);

  useEffect(() => {
    if (!hintMint || !walletAddress) return;
    const record = launchDetail.data;
    if (!record || record.mint !== hintMint || creatorOf(record) !== walletAddress) return;
    const next = recordToStoredLaunch(record);
    writeStoredLaunch(walletAddress, next);
    setStoredLaunch(prev => prev ?? next);
  }, [hintMint, walletAddress, launchDetail.data]);

  const launchVerification: LaunchVerification = !rememberedMint
    ? 'none'
    : trackerBacked || launchDetail.data
      ? 'confirmed'
      : launchDetail.isError
        ? 'unreachable'
        : launchDetail.isFetched
          ? 'missing'
          : 'checking';

  const launchRecord: LaunchRecord | null = rememberedMint ? (launchDetail.data ?? (trackerBacked ? trackerLaunch : null)) : null;

  /* Missing on the tracker: a pre-LaunchLab token or a wiped database. Forget it everywhere. */
  useEffect(() => {
    if (launchVerification !== 'missing' || !rememberedMint) return;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(`[home] launch ${rememberedMint} is not on the tracker; forgetting it`);
    }
    clearStoredLaunch(walletAddress);
    setStoredLaunch(prev => (prev?.mint === rememberedMint ? null : prev));
    if (getProfile()?.launchedToken?.contractAddr === rememberedMint) {
      updateProfile({ launchedToken: null, launchWalletAddress: null });
    }
    setLaunchedToken(prev => (prev?.contractAddr === rememberedMint ? null : prev));
  }, [launchVerification, rememberedMint, walletAddress]);

  /* Confirmed: fill in what a legacy or partial record was missing. */
  useEffect(() => {
    if (!launchRecord || !walletAddress) return;
    setStoredLaunch(prev => {
      if (!prev || prev.mint !== launchRecord.mint) return prev;
      if (prev.poolId && prev.quoteMint && !prev.legacy) return prev;
      const next: StoredLaunch = {
        ...prev,
        ...(launchRecord.pool_id ? { poolId: launchRecord.pool_id } : {}),
        ...(launchRecord.quote_mint ? { quoteMint: launchRecord.quote_mint } : {}),
        legacy: isLegacyStoredLaunch({ poolId: launchRecord.pool_id, quoteMint: launchRecord.quote_mint }),
      };
      writeStoredLaunch(walletAddress, next);
      return next;
    });
  }, [launchRecord, walletAddress]);

  /* ==============================================================
     BINDING: claim the launch once the agent is live
     ============================================================== */
  const launchClaim = useLaunchClaim();
  const { claim } = launchClaim;

  useEffect(() => {
    const agentUp = installStep === 'live' || installStep === 'fork';
    if (!agentUp || launchVerification !== 'confirmed' || !storedLaunch || storedLaunch.bound) return;
    const { mint } = storedLaunch;
    let cancelled = false;

    claim(mint).then(result => {
      if (cancelled || !result) return;
      markStoredLaunchBound(walletAddress, mint, result.creditsGranted);
      const quoteSymbol = result.launch?.quoteSymbol;
      setStoredLaunch(prev =>
        prev && prev.mint === mint
          ? { ...prev, bound: true, creditsGranted: result.creditsGranted, ...(quoteSymbol ? { quoteSymbol } : {}) }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.credits.balance });
    });

    return () => {
      cancelled = true;
    };
  }, [installStep, launchVerification, storedLaunch, walletAddress, claim, queryClient]);

  /* ==============================================================
     INSTALL: driven by DaemonProvider's health, never by a poll of its own
     ============================================================== */

  /* React to daemon state changes.
   * - Daemon comes online while idle/crashed/reconnecting → jump to fork
   * - Daemon comes online during the install watch → live (celebration), then fork
   * - Daemon answers but is not healthy yet during the watch → detecting
   * - Daemon goes offline while at fork → crashed (if previously installed) or idle */
  const healthStatus = health.status;
  /* Every healthy poll refreshes the last-seen clock (the health object changes per poll). */
  useEffect(() => {
    if (connected) lastSeenRef.current = Date.now();
  }, [connected, health]);
  useEffect(() => {
    if (connected) {
      if (installStep === 'idle' || installStep === 'crashed' || installStep === 'reconnecting') {
        setInstallStep('fork');
        setReconnectAttempt(0);
        recordDaemonInstall();
      } else if (installStep === 'waiting' || installStep === 'detecting') {
        setInstallStep('live');
        recordDaemonInstall();
      }
      return;
    }
    if (installStep === 'fork') {
      const profile = getProfile();
      setLastSeenAt(lastSeenRef.current);
      setInstallStep(profile?.hasInstalledDaemon ? 'crashed' : 'idle');
    } else if (installStep === 'waiting' && (healthStatus === 'starting' || healthStatus === 'degraded')) {
      setInstallStep('detecting');
    }
  }, [connected, healthStatus, installStep]);

  /* "live" step holds for 3s then advances to "fork" */
  useEffect(() => {
    if (installStep !== 'live') return;
    const timer = setTimeout(() => setInstallStep('fork'), 3000);
    return () => clearTimeout(timer);
  }, [installStep]);

  /* Auto-reconnect — a bounded, user-started run of probes after Restart. */
  useEffect(() => {
    if (installStep !== 'reconnecting') {
      if (reconnectRef.current) {
        clearInterval(reconnectRef.current);
        reconnectRef.current = null;
      }
      return;
    }

    function attemptReconnect() {
      setReconnectAttempt(prev => {
        const next = prev + 1;
        if (next > MAX_RECONNECT_ATTEMPTS) {
          setInstallStep('crashed');
          return 0;
        }
        return next;
      });
      void refresh();
    }

    attemptReconnect();
    reconnectRef.current = setInterval(attemptReconnect, RECONNECT_INTERVAL_MS);
    return () => {
      if (reconnectRef.current) {
        clearInterval(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [installStep, refresh]);

  /** Trigger restart from crashed state */
  const handleRestart = useCallback(async () => {
    setReconnectAttempt(0);
    setInstallStep('reconnecting');
    await daemonControl.start();
  }, []);

  /** Cancel reconnect and go back to crashed */
  const handleCancelReconnect = useCallback(() => {
    setInstallStep('crashed');
    setReconnectAttempt(0);
  }, []);

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** The Download click is the only thing that starts install detection. */
  function handleDownload() {
    if (installStep === 'idle') {
      setInstallStep('waiting');
      installStartRef.current = Date.now();
      startInstallWatch();
    }
  }

  /** The watch gave up (120 s). `setInstallTimeout(false)` is the manual Retry. */
  const installTimeout = installWatch.timedOut && (installStep === 'waiting' || installStep === 'detecting');
  const setInstallTimeout = useCallback(
    (timedOut: boolean) => {
      if (timedOut) stopInstallWatch();
      else startInstallWatch();
    },
    [startInstallWatch, stopInstallWatch],
  );

  const { addToast, dismissToast } = useToast();

  /* A failed bind is worth one warning; the launch is on chain either way and the
     hook allows a retry on the next daemon connect. A bind that lands afterwards
     takes the warning down with it. */
  const claimErrorShown = useRef<string | null>(null);
  const claimToastId = useRef<string | null>(null);
  useEffect(() => {
    if (launchClaim.status === 'claimed' && claimToastId.current) {
      dismissToast(claimToastId.current);
      claimToastId.current = null;
      claimErrorShown.current = null;
      return;
    }
    if (launchClaim.status !== 'error' || !launchClaim.error) return;
    if (claimErrorShown.current === launchClaim.error) return;
    claimErrorShown.current = launchClaim.error;
    claimToastId.current = addToast({
      title: 'Token not bound to your agent yet',
      description: launchClaim.error,
      variant: 'warning',
      autoDismiss: false,
    });
  }, [launchClaim.status, launchClaim.error, addToast, dismissToast]);

  /** Set launched token in state AND persist it for this wallet (localStorage + profile, wallet-keyed) */
  const handleSetLaunchedToken = useCallback(
    (token: LaunchedToken | null) => {
      setLaunchedToken(token);
      if (!token) return;

      const record = toStoredLaunch(token);
      writeStoredLaunch(walletAddress, record);
      setStoredLaunch(prev => (prev && prev.mint === record.mint ? prev : record));

      persistTokenLaunch(token, walletAddress);
      // The header and hero read the tracker's answer for this wallet; make them re-ask.
      if (walletAddress) queryClient.invalidateQueries({ queryKey: launchKeys.byWallet(walletAddress) });
      persistLaunchedToken(token)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tokens.list(TOKEN_LIST_LIMIT) });
        })
        .catch(() => {
          addToast({
            title: 'Token launched, agent not connected yet',
            description:
              'Your token is live on chain. Run the StonkAgents agent on this machine to bind it and collect your launch reward.',
            variant: 'warning',
            autoDismiss: false,
          });
        });
    },
    [queryClient, addToast, walletAddress],
  );

  /* Self-healing: re-POST token on 404 from GET /api/peers/:id/token */
  useTokenSync(health.peerId, connected, launchVerification === 'confirmed' ? launchedToken : null);

  /* ==============================================================
     DERIVED: the top-level phase
     ============================================================== */
  /* A remembered launch only opens Step 2 once the tracker has confirmed it (or is
     unreachable, in which case the card degrades). While checking, or when the
     tracker does not know the mint, the visitor stays on the Launchpad. */
  const tokenInPlay = launchVerification === 'confirmed' || launchVerification === 'unreachable';

  /* ==============================================================
     PERMISSIONS (RUN-1): the agent's setup checks gate Live
     ============================================================== */
  /* Polled only while the agent is connected. A 404 (no setup surface yet) or an
     unreachable call never blocks: a healthy daemon is a running agent. Only a real
     answer with a check that is not ok holds Step 2 at Permissions. Once the
     visitor has had to fix something, "Launch your agent" is the way through. */
  const setup = useDaemonSetup();
  const [setupEverBlocked, setSetupEverBlocked] = useState(false);
  const [setupConfirmed, setSetupConfirmed] = useState(false);
  useEffect(() => {
    if (setup.state === 'blocked') setSetupEverBlocked(true);
  }, [setup.state]);
  useEffect(() => {
    if (connected) return;
    setSetupEverBlocked(false);
    setSetupConfirmed(false);
  }, [connected]);
  const confirmSetup = useCallback(() => setSetupConfirmed(true), []);

  const agentStage: AgentStage = !connected
    ? 'install'
    : setup.state === 'checking' || setup.state === 'blocked' || (setup.state === 'ready' && setupEverBlocked && !setupConfirmed)
      ? 'permissions'
      : 'live';

  const phase: HomePhase =
    !activeToken || !tokenInPlay ? 'launch' : installStep === 'fork' && agentStage === 'live' ? 'live' : 'agent';

  /* One agent per wallet (#21): the hero shows this instead of Launch. The
     tracker's own answer for the wallet comes first — it is what the tracker
     enforces server-side with a 409 — and the verified local record after it. */
  const existingAgent = useMemo<ExistingAgent | null>(() => {
    if (walletAddress && byWalletLaunch) {
      return {
        mint: byWalletLaunch.mint,
        name: byWalletLaunch.name,
        symbol: byWalletLaunch.symbol,
        href: `/tokens/${byWalletLaunch.mint}`,
      };
    }
    if (!activeToken || !tokenInPlay) return null;
    return {
      mint: activeToken.contractAddr,
      name: activeToken.name,
      symbol: activeToken.ticker,
      href: `/tokens/${activeToken.contractAddr}`,
    };
  }, [walletAddress, byWalletLaunch, activeToken, tokenInPlay]);

  /* ==============================================================
     INSTALLER: Step 2 is locked until this wallet has launched (Step 1)
     ============================================================== */
  /* The one flag every download surface reads. While it is false the hook
     hands out no URL at all, so the launch phase can never show a link. */
  const installerUnlocked = existingAgent !== null;
  const { os, downloadUrl, downloads, manifestState, retry: retryDownloads } = useInstallerDownloads(installerUnlocked);

  /* A launch that surfaces for this wallet while the wizard is open (tracker
     answered after connect) closes it. The token the wizard itself just
     launched is exempt so the success screen stays. */
  useEffect(() => {
    if (!showWizard || !existingAgent || launchedToken) return;
    setShowWizard(false);
    addToast({
      title: `This wallet already launched $${existingAgent.symbol}`,
      description: 'One agent per wallet. Open it from the header, or connect another wallet to launch again.',
      variant: 'info',
      autoDismiss: true,
      duration: 8_000,
    });
  }, [showWizard, existingAgent, launchedToken, addToast]);

  /**
   * Launch is always tappable: disconnected, it opens the shared connect prompt
   * and continues into the wizard once a wallet is in (#4). A wallet that
   * already has an agent gets no wizard (#21). Resolves with whether the wizard opened.
   */
  const walletConnected = wallet.connected;
  const walletConnect = wallet.connect;
  const existingAgentRef = useRef(existingAgent);
  existingAgentRef.current = existingAgent;
  const openLaunch = useCallback(async (): Promise<boolean> => {
    if (!walletConnected && !(await walletConnect())) return false;
    if (existingAgentRef.current) return false;
    setShowWizard(true);
    return true;
  }, [walletConnected, walletConnect]);

  /* Tracker metrics for the launched token. LaunchLab tokens are routed through
     the recorded launch, so this is the same source the detail page reads. */
  const metricsQuery = useTokenMetrics(health.peerId || null, activeToken?.contractAddr ?? null, {
    enablePolling: true,
  });

  /* Shape expected by HeroConnectedHome: tokenMetrics.data + tokenMetrics.isLoading.
     The peer route needs the agent up; until then the launch record carries the
     same figures (GET /api/launch/{mint} is metrics-enriched), so the card shows
     market cap, curve and holders right after the launch instead of dashes. */
  const recordMetrics = useMemo<TokenMetricsResponse | undefined>(() => {
    const m = launchRecord?.metrics;
    if (!m) return undefined;
    return {
      marketCapUsd: m.marketCapUsd ?? null,
      solRaised: null,
      bondingCurvePercent: m.curveProgressPct ?? null,
      complete: m.graduated ?? null,
      createdAt: launchRecord?.createdAt ?? launchRecord?.created_at ?? null,
      imageUrl: launchRecord?.imageUrl ?? launchRecord?.image_url ?? null,
      holders: m.holders ?? null,
      priceUsd: m.priceUsd ?? null,
    };
  }, [launchRecord]);
  const tokenMetrics = { data: metricsQuery.data ?? recordMetrics, isLoading: metricsQuery.isLoading && !recordMetrics };

  const creditsGranted = launchClaim.result?.creditsGranted ?? storedLaunch?.creditsGranted ?? null;

  return {
    /* data */
    visionStats,
    trendingAssets,
    mostInstalled,
    recentlyShared,
    /* two-step product phase */
    phase,
    /* install state machine */
    installStep,
    installTimeout,
    setInstallTimeout,
    installStartRef,
    /* whether this platform can run the agent at all ('unsupported' on Mac and phones) */
    agentSupport,
    /* download (empty until installerUnlocked) */
    installerUnlocked,
    os,
    downloadUrl,
    downloads,
    manifestState,
    retryDownloads,
    handleDownload,
    /* permissions (Step 2, RUN-1) */
    setup,
    agentStage,
    confirmSetup,
    /* crash / reconnect */
    reconnectAttempt,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    lastSeenAt,
    handleRestart,
    handleCancelReconnect,
    /* interaction state */
    copied,
    handleCopy,
    /* deep dive */
    ddTab,
    setDdTab,
    /* platform */
    platform,
    setPlatform,
    /* wallet (Step 1) */
    walletConnected,
    walletAddress,
    /* launch (Step 1) + binding (Step 2) */
    showWizard,
    setShowWizard,
    openLaunch,
    existingAgent,
    launchedToken: activeToken,
    setLaunchedToken: handleSetLaunchedToken,
    storedLaunch,
    launchVerification,
    launchRecord,
    claimStatus: launchClaim.status,
    creditsGranted,
    /* token metrics */
    tokenMetrics,
  };
}

export type HomePageState = ReturnType<typeof useHomePage>;
