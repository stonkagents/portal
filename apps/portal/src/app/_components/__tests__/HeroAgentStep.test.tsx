/**
 * Purpose: Tests for HeroAgentStep — Step 2, token card on top of the install flow.
 *          The LaunchLab headline is reserved for a tracker-confirmed launch.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LaunchRecord } from '@/lib/api/launches';

vi.mock('@/lib/api/hooks/use-launch-detail', () => ({
  quoteSymbolForMint: (mint?: string | null) => (mint ? 'STONK' : null),
}));

vi.mock('../HeroInstallFlow', () => ({
  HeroInstallFlow: ({ installerUnlocked, downloadUrl }: { installerUnlocked: boolean; downloadUrl?: string }) => (
    <div data-testid="hero-install-flow" data-unlocked={installerUnlocked ? 'true' : 'false'} data-download={downloadUrl ?? ''} />
  ),
}));

vi.mock('../TokenPerformanceCard', () => ({
  TokenPerformanceCard: ({
    mint,
    quoteSymbol,
    unreachable,
    isLoading,
  }: {
    mint: string | null;
    quoteSymbol?: string | null;
    unreachable?: boolean;
    isLoading: boolean;
  }) => (
    <div
      data-testid="token-performance-card"
      data-mint={mint ?? ''}
      data-quote={quoteSymbol ?? ''}
      data-unreachable={unreachable ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
    />
  ),
}));

import { HeroAgentStep, isLiveOnLaunchLab } from '../HeroAgentStep';

const MINT = 'MinT1111111111111111111111111111111111111111';

const installProps = {
  installStep: 'idle' as const,
  installTimeout: false,
  setInstallTimeout: vi.fn(),
  installStartRef: { current: 0 },
  installerUnlocked: true,
  os: 'macos' as const,
  downloadUrl: '/StonkAgents.dmg',
  downloads: { macos: '/StonkAgents.dmg', windows: '/StonkAgents.exe' },
  handleDownload: vi.fn(),
  tokenMetrics: { data: undefined, isLoading: false },
  manifestState: 'ready' as const,
  retryDownloads: vi.fn(),
  setup: { state: 'idle' as const, status: null, fixing: null, fixError: null, fixNote: null, applyFix: vi.fn(), refresh: vi.fn() },
  agentStage: 'install' as const,
  confirmSetup: vi.fn(),
  claimStatus: 'idle' as const,
};

const TOKEN = { name: 'Agent One', ticker: 'AGENT', imageDataUrl: null, contractAddr: MINT };

const CONFIRMED: LaunchRecord = {
  mint: MINT,
  pool_id: 'Poo1',
  creator_wallet: 'Wa11et',
  quote_mint: 'QuoteMint',
  name: 'Agent One',
  symbol: 'TRACKED',
  launch_signature: 'sig',
  fee_lamports: 1,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isLiveOnLaunchLab', () => {
  it('needs a confirmed status and a pool', () => {
    expect(isLiveOnLaunchLab(null)).toBe(false);
    expect(isLiveOnLaunchLab({ ...CONFIRMED, pool_id: undefined })).toBe(false);
    expect(isLiveOnLaunchLab({ ...CONFIRMED, status: 'pending' })).toBe(false);
    expect(isLiveOnLaunchLab(CONFIRMED)).toBe(true);
  });
});

describe('HeroAgentStep', () => {
  it('marks Step 1 done and Step 2 current on the rail', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={TOKEN}
        storedLaunch={null}
        launchRecord={CONFIRMED}
        launchVerification="confirmed"
      />,
    );
    expect(screen.getByTestId('step-bullet-1')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('step-bullet-2')).toHaveAttribute('data-state', 'current');
  });

  it('says the token is live on LaunchLab only when the tracker confirmed it', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={TOKEN}
        storedLaunch={null}
        launchRecord={CONFIRMED}
        launchVerification="confirmed"
      />,
    );
    expect(screen.getByTestId('agent-step-headline')).toHaveTextContent('$TRACKED is live on Raydium LaunchLab, now run its agent');
  });

  it('does not claim LaunchLab for a remembered token the tracker has not confirmed', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={TOKEN}
        storedLaunch={null}
        launchRecord={null}
        launchVerification="unreachable"
      />,
    );
    const headline = screen.getByTestId('agent-step-headline');
    expect(headline).toHaveTextContent('$AGENT, now run its agent');
    expect(headline).not.toHaveTextContent('LaunchLab');
  });

  it('degrades the card when the tracker is unreachable', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={TOKEN}
        storedLaunch={null}
        launchRecord={null}
        launchVerification="unreachable"
      />,
    );
    expect(screen.getByTestId('token-performance-card')).toHaveAttribute('data-unreachable', 'true');
  });

  it('puts the token card above the install flow', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={TOKEN}
        storedLaunch={null}
        launchRecord={CONFIRMED}
        launchVerification="confirmed"
      />,
    );
    expect(screen.getByTestId('token-performance-card')).toHaveAttribute('data-mint', MINT);
    expect(screen.getByTestId('token-performance-card')).toHaveAttribute('data-unreachable', 'false');
    expect(screen.getByTestId('hero-install-flow')).toBeInTheDocument();
  });

  it('hands the install flow the unlocked installer once the token is launched', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={TOKEN}
        storedLaunch={null}
        launchRecord={CONFIRMED}
        launchVerification="confirmed"
      />,
    );
    const flow = screen.getByTestId('hero-install-flow');
    expect(flow).toHaveAttribute('data-unlocked', 'true');
    expect(flow).toHaveAttribute('data-download', '/StonkAgents.dmg');
  });

  it('falls back to the stored launch when no token is in state', () => {
    render(
      <HeroAgentStep
        {...installProps}
        launchedToken={null}
        storedLaunch={{ mint: MINT, name: 'Agent One', symbol: 'AGENT', quoteSymbol: 'STONK' }}
        launchRecord={null}
        launchVerification="unreachable"
      />,
    );
    expect(screen.getByTestId('agent-step-headline')).toHaveTextContent('$AGENT');
    expect(screen.getByTestId('token-performance-card')).toHaveAttribute('data-quote', 'STONK');
  });
});
