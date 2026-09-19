'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './Navbar';
import { MobileDrawer } from './MobileDrawer';
import { MobileBottomNav } from './MobileBottomNav';
import { Footer } from './Footer';
import { SplashScreen } from './SplashScreen';
import { PageLoader } from './PageLoader';
import { DevResetButton } from './DevResetButton';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { WalletLinkEffect } from './WalletLinkEffect';
import { NavigationLoader } from './NavigationLoader';
import { usePathname } from 'next/navigation';
import { useDaemon } from '@/providers/DaemonProvider';
import { usePageReadiness } from '@/providers/PageReadinessProvider';
import { useToast } from '@/providers/ToastProvider';
import { useTranslation } from '@/providers/I18nProvider';
import { UpdateBanner } from './UpdateBanner';
import { UiUpdateBar } from './UiUpdateBar';
import { useUpdateStatus } from '@/lib/api/hooks/use-update-status';
import { FeedbackDialogHost } from '@/components/features/feedback';
import { InterestDialogHost } from '@/components/features/interest';
import { DevDrip } from '@/components/features/devnet';

const SPLASH_KEY = 'stonkagents-splash-seen';

interface LayoutShellProps {
  children: React.ReactNode;
}

/**
 * Page outlet. `children` arrives from the server payload as a lazy element until every client
 * module it references has loaded. When such a lazy child sits directly under a host element and
 * resolves mid-hydration, React replays the host fiber and re-claims its DOM node against an
 * already-advanced hydration cursor (React #418, seen intermittently on every route in production).
 * Reconciling the lazy child inside a function component makes the replay safe.
 */
function PageOutlet({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Client-side layout shell composing Navbar, MobileDrawer, MobileBottomNav,
 * and shared state (drawer open).
 * Daemon connection state and the Kill Switch (agent stopped by the owner) come from
 * DaemonProvider (single source of truth); the shell only wires the buttons and banner.
 */
export function LayoutShell({ children }: LayoutShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const pathname = usePathname();
  const { connected, daemonStatus, envMismatch, toggleDaemon, stoppedByUser, stopAgent, startAgent } = useDaemon();
  const { isPageReady, reportReady } = usePageReadiness();
  const { addToast } = useToast();
  const { t } = useTranslation();

  /* Kill Switch: stop the agent through the controller; Resume starts it again. The banner
     shows only while the owner's stop is in effect and the agent is really down. */
  const [killBusy, setKillBusy] = useState(false);
  const killActive = stoppedByUser && !connected;
  const onKillToggle = useCallback(async () => {
    if (killBusy) return;
    setKillBusy(true);
    try {
      const ok = stoppedByUser ? await startAgent() : await stopAgent();
      if (!ok) {
        addToast({
          title: t(stoppedByUser ? 'killSwitch.startFailed' : 'killSwitch.stopFailed'),
          description: t('killSwitch.controlHint'),
          variant: 'error',
        });
      }
    } finally {
      setKillBusy(false);
    }
  }, [killBusy, stoppedByUser, startAgent, stopAgent, addToast, t]);
  const { data: updateStatus, startUpdate, cancelUpdate } = useUpdateStatus();

  /* null until mounted: the server and the first client render must produce the same tree
     (hydration), so storage is only consulted in an effect. Seen once per browser, like the welcome popup. */
  const [splashSeen, setSplashSeen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setSplashSeen(!!(localStorage.getItem(SPLASH_KEY) || sessionStorage.getItem(SPLASH_KEY)));
    } catch {
      setSplashSeen(true);
    }
  }, []);
  /* The splash is a first-visit welcome for the home page only. Deep links (/tokens/<mint>,
     shared posts, 404s) go straight to their content. */
  /* Until storage has been read, keep the splash mounted: it paints a plain dark cover on the
     server-rendered frame, so a first visit never flashes the home page underneath. */
  const showSplash = pathname === '/' && splashSeen !== true;

  useEffect(() => {
    reportReady('layout-mounted');
  }, [reportReady]);

  /* Reset banner dismiss when a new version appears or state changes */
  const updateVersion = updateStatus?.latestVersion;
  const updateState = updateStatus?.state;
  useEffect(() => {
    if (updateVersion) setBannerDismissed(false);
  }, [updateVersion, updateState]);

  /* Auto-dismiss COMPLETE banner after 10s */
  useEffect(() => {
    if (updateState !== 'COMPLETE') return;
    const timer = setTimeout(() => setBannerDismissed(true), 10_000);
    return () => clearTimeout(timer);
  }, [updateState]);

  /* Toast notification when update is cancelled */
  useEffect(() => {
    if (updateState === 'CANCELLED') {
      addToast({ title: 'Update cancelled', variant: 'info' });
    }
  }, [updateState, addToast]);

  return (
    <>
      <WalletLinkEffect />
      {/* Dev deployment on devnet only: test SOL + $STONK for every connecting wallet (inert elsewhere). */}
      <DevDrip />
      {showSplash && <SplashScreen />}
      {/* FB-1: the one feedback dialog, mounted beside the splash so it exists on every route. */}
      <FeedbackDialogHost />
      {/* RI-1: the roadmap interest dialog ("What should your agent be able to do?"), same reach. */}
      <InterestDialogHost />
      {!showSplash && <PageLoader ready={isPageReady} />}
      <NavigationLoader />
      <Navbar
        connected={connected}
        daemonStatus={daemonStatus}
        onToggleDrawer={() => setDrawerOpen(v => !v)}
        onDisconnect={toggleDaemon}
        killActive={killActive}
        killBusy={killBusy}
        onKillToggle={onKillToggle}
        envMismatch={envMismatch}
      />

      {/* S3: a newer UI build was deployed; offer a reload, never force one. */}
      <UiUpdateBar />

      {/* Agent update banner: only while the agent is connected (PERF-3); a stale answer never lingers. */}
      {connected && updateStatus && (
        <div
          className={`transition-[max-height,opacity] duration-250 ease-out overflow-hidden ${
            bannerDismissed ? 'max-h-0 opacity-0' : 'max-h-[40rem] opacity-100'
          }`}
          /* animation-tier: 2 — functional: banner entry/exit */
        >
          <UpdateBanner
            status={updateStatus}
            onStartUpdate={startUpdate}
            onCancelUpdate={cancelUpdate}
            onDismiss={() => setBannerDismissed(true)}
          />
        </div>
      )}

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        connected={connected}
        onKillToggle={onKillToggle}
        killActive={killActive}
        killBusy={killBusy}
        onDisconnect={toggleDaemon}
      />

      {/* Main content — flex column so pages can use flex-1; min-w-0 prevents horizontal overflow.
          The footer, not this element, carries the clearance for the mobile tab bar. */}
      <main className="flex-1 flex flex-col min-w-0">
        <PageOutlet>{children}</PageOutlet>
      </main>

      <Footer />
      <MobileBottomNav />
      <DevResetButton />
      <ToastContainer />
    </>
  );
}
