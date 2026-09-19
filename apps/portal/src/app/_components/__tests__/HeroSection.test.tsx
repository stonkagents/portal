/**
 * Story: Home two-step flow
 * Purpose: Tests for HeroSection — the right hero per phase, with the daemon
 *          crash/reconnect sub-states outranking the phase.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HeroSection } from '../HeroSection';
import type { InstallStep, HomePhase } from '../useHomePage';

/* Mock heavy children to keep tests fast and focused on routing */
vi.mock('../HeroLaunchpad', () => ({
  HeroLaunchpad: () => <div data-testid="hero-launchpad" />,
}));
vi.mock('../HeroAgentStep', () => ({
  HeroAgentStep: () => <div data-testid="hero-agent-step" />,
}));
vi.mock('../HeroConnectedHome', () => ({
  HeroConnectedHome: () => <div data-testid="connected-home" />,
}));
vi.mock('../HeroDaemonCrashed', () => ({
  HeroDaemonCrashed: ({ onRestart }: { onRestart: () => void }) => (
    <div data-testid="hero-daemon-crashed">
      <button onClick={onRestart}>restart</button>
    </div>
  ),
}));
vi.mock('../HeroDaemonReconnecting', () => ({
  HeroDaemonReconnecting: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="hero-daemon-reconnecting">
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}));
vi.mock('@/components/ui', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Icon: () => <span />,
}));
vi.mock('@/components/features/network-map', () => ({
  NetworkMap: () => <div data-testid="network-map" />,
}));
vi.mock('../ActionCard', () => ({
  ActionCard: () => <div data-testid="action-card" />,
}));

// Minimal shape — the component only passes it through to children
const mockTokenMetrics = { data: undefined, isLoading: false };

const baseProps = {
  phase: 'launch' as HomePhase,
  installStep: 'idle' as InstallStep,
  installTimeout: false,
  setInstallTimeout: vi.fn(),
  installStartRef: { current: 0 },
  installerUnlocked: false,
  os: 'macos' as const,
  downloadUrl: '/StonkAgents-0.1.0.dmg',
  downloads: { macos: '/StonkAgents-0.1.0.dmg', windows: '/StonkAgents-Setup-0.1.0.exe' },
  handleDownload: vi.fn(),
  copied: false,
  handleCopy: vi.fn(),
  showWizard: false,
  setShowWizard: vi.fn(),
  launchedToken: null,
  storedLaunch: null,
  launchRecord: null,
  launchVerification: 'none' as const,
  walletConnected: false,
  creditsGranted: null,
  handleRestart: vi.fn(),
  handleCancelReconnect: vi.fn(),
  reconnectAttempt: 0,
  maxReconnectAttempts: 5,
  lastSeenAt: null,
  tokenMetrics: mockTokenMetrics,
  openLaunch: vi.fn(async () => true),
  existingAgent: null,
  manifestState: 'ready' as const,
  retryDownloads: vi.fn(),
  setup: { state: 'idle' as const, status: null, fixing: null, fixError: null, fixNote: null, applyFix: vi.fn(), refresh: vi.fn() },
  agentStage: 'install' as const,
  confirmSetup: vi.fn(),
  claimStatus: 'idle' as const,
};

describe('HeroSection phase routing', () => {
  it('renders the launchpad in the launch phase', () => {
    render(<HeroSection {...baseProps} phase="launch" />);
    expect(screen.getByTestId('hero-launchpad')).toBeInTheDocument();
    expect(screen.queryByTestId('connected-home')).not.toBeInTheDocument();
  });

  it('renders Step 2 in the agent phase', () => {
    render(<HeroSection {...baseProps} phase="agent" />);
    expect(screen.getByTestId('hero-agent-step')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-launchpad')).not.toBeInTheDocument();
  });

  it('renders the connected home in the live phase', () => {
    render(<HeroSection {...baseProps} phase="live" installStep="fork" />);
    expect(screen.getByTestId('connected-home')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-agent-step')).not.toBeInTheDocument();
  });

  it('keeps Step 2 through the install sub-states', () => {
    for (const step of ['waiting', 'detecting', 'live'] as InstallStep[]) {
      const { unmount } = render(<HeroSection {...baseProps} phase="agent" installStep={step} />);
      expect(screen.getByTestId('hero-agent-step')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('HeroSection daemon sub-states', () => {
  it('shows the crashed hero regardless of phase', () => {
    render(<HeroSection {...baseProps} phase="live" installStep="crashed" />);
    expect(screen.getByTestId('hero-daemon-crashed')).toBeInTheDocument();
    expect(screen.queryByTestId('connected-home')).not.toBeInTheDocument();
  });

  it('shows the reconnecting hero regardless of phase', () => {
    render(<HeroSection {...baseProps} phase="agent" installStep="reconnecting" />);
    expect(screen.getByTestId('hero-daemon-reconnecting')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-agent-step')).not.toBeInTheDocument();
  });
});

describe('HeroSection layout', () => {
  it('renders no step rail above the card', () => {
    render(<HeroSection {...baseProps} phase="launch" />);
    expect(screen.queryByTestId('step-rail')).not.toBeInTheDocument();
  });

  it('renders the action card only in the live phase', () => {
    const { unmount } = render(<HeroSection {...baseProps} phase="live" installStep="fork" />);
    expect(screen.getByTestId('action-card-slot')).toBeInTheDocument();
    unmount();

    render(<HeroSection {...baseProps} phase="launch" />);
    expect(screen.queryByTestId('action-card-slot')).not.toBeInTheDocument();
  });
});
