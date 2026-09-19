/**
 * Purpose: Tests for ChatDaemonSetupPanel — the installer is Step 2: a wallet that has
 *          not launched a token gets no download here, only the way to the launchpad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const gate = vi.hoisted(() => ({ unlocked: false }));
vi.mock('@/lib/installer/use-installer-unlock', () => ({ useInstallerUnlocked: () => gate.unlocked }));

/* The copy names the agent by the address the env configures (dev: 127.0.0.1:7861). */
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://127.0.0.1:7861/api/v1', downloadBaseUrl: 'https://releases.dev.example' },
}));

const EXE = 'https://releases.example.test/StonkAgents-Setup-2.1.5.exe';
const downloadsHook = vi.hoisted(() => vi.fn());
vi.mock('@/lib/installer/use-installer-downloads', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/installer/use-installer-downloads');
  return { ...actual, useInstallerDownloads: (unlocked: boolean) => downloadsHook(unlocked) };
});

vi.mock('../use-chat-daemon-install-flow', () => ({
  useChatDaemonInstallFlow: () => ({
    installStep: 'idle',
    installTimeout: false,
    setInstallTimeout: vi.fn(),
    installStartRef: { current: 0 },
    handleDownload: vi.fn(),
  }),
}));

vi.mock('@/app/_components/HeroInstallFlow', () => ({
  HeroInstallFlow: ({ installerUnlocked, downloadUrl }: { installerUnlocked: boolean; downloadUrl?: string }) => (
    <div data-testid="hero-install-flow" data-unlocked={installerUnlocked ? 'true' : 'false'} data-download={downloadUrl ?? ''} />
  ),
}));

vi.mock('@/components/ui', () => ({ Icon: () => <span /> }));

/* The daemon context: only envMismatch matters here (a healthy agent of another build). */
const daemonState = vi.hoisted(() => ({ envMismatch: null as null | Record<string, unknown> }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ envMismatch: daemonState.envMismatch, platform: 'windows' }) }));
vi.mock('@/components/features/onboarding/AgentEnvMismatchNotice', () => ({
  AgentEnvMismatchNotice: ({ 'data-testid': testId }: { 'data-testid'?: string }) => <div data-testid={testId}>mismatch notice</div>,
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ChatDaemonSetupPanel } from '../ChatDaemonSetupPanel';

function open() {
  render(<ChatDaemonSetupPanel daemonConnected={false} onRefreshDaemon={vi.fn(async () => {})} />);
  fireEvent.click(screen.getByTestId('chat-daemon-panel-expand'));
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.unlocked = false;
  daemonState.envMismatch = null;
  downloadsHook.mockImplementation((unlocked: boolean) => ({
    os: 'windows',
    downloadUrl: unlocked ? EXE : undefined,
    downloads: { macos: undefined, windows: unlocked ? EXE : undefined },
    manifestState: 'ready',
    retry: vi.fn(),
    unlocked,
  }));
});

describe('ChatDaemonSetupPanel before the token is launched', () => {
  it('shows no install flow and no download, only the placeholder and a link to the launchpad', () => {
    open();
    expect(screen.getByTestId('chat-daemon-setup-panel')).toBeInTheDocument();
    expect(screen.getByTestId('chat-daemon-panel-locked')).toHaveTextContent(
      'Launch your token first. The installer unlocks right after.',
    );
    expect(screen.getByText(/Your agent unlocks after you launch a token/)).toBeInTheDocument();
    expect(screen.getByTestId('chat-daemon-panel-launchpad')).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('hero-install-flow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-daemon-panel-home-install')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('.exe');
    expect(downloadsHook).toHaveBeenCalledWith(false);
  });

  it('keeps the copy free of em and en dashes', () => {
    open();
    expect(screen.getByTestId('chat-daemon-setup-panel').textContent).not.toMatch(/[–—]/);
  });
});

describe('ChatDaemonSetupPanel with an agent of another build', () => {
  it('names the wrong build instead of calling the agent offline, and shows the notice in place of the install flow', () => {
    gate.unlocked = true;
    daemonState.envMismatch = { agentEnv: 'stg', siteEnv: 'dev', agentTrackerHost: 'tracker.stg.example' };
    render(<ChatDaemonSetupPanel daemonConnected={false} onRefreshDaemon={vi.fn(async () => {})} />);
    expect(screen.getByTestId('chat-daemon-panel-expand')).toHaveTextContent('Wrong agent build');
    fireEvent.click(screen.getByTestId('chat-daemon-panel-expand'));
    expect(screen.getByText('Your agent is another build.')).toBeInTheDocument();
    expect(screen.getByTestId('chat-daemon-panel-env-mismatch')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-install-flow')).not.toBeInTheDocument();
    expect(screen.queryByText(/is offline/)).not.toBeInTheDocument();
  });
});

describe('ChatDaemonSetupPanel once the wallet has launched', () => {
  it('renders the install flow with the manifest-backed download', () => {
    gate.unlocked = true;
    open();
    const flow = screen.getByTestId('hero-install-flow');
    expect(flow).toHaveAttribute('data-unlocked', 'true');
    expect(flow).toHaveAttribute('data-download', EXE);
    expect(screen.getByText(/verify on/)).toBeInTheDocument();
    expect(screen.getByTestId('chat-daemon-panel-home-install')).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('chat-daemon-panel-locked')).not.toBeInTheDocument();
    expect(downloadsHook).toHaveBeenCalledWith(true);
  });

  it('renders nothing while the agent is connected', () => {
    gate.unlocked = true;
    render(<ChatDaemonSetupPanel daemonConnected onRefreshDaemon={vi.fn(async () => {})} />);
    expect(screen.queryByTestId('chat-daemon-panel-expand')).not.toBeInTheDocument();
  });

  it('names the configured agent address, never a fixed port', () => {
    gate.unlocked = true;
    open();
    expect(screen.getByTestId('chat-daemon-setup-panel')).toHaveTextContent('verify on 127.0.0.1:7861');
    expect(document.body.innerHTML).not.toContain('localhost:7841');
  });

  it('after a failed Check connection, points at the browser local network permission', async () => {
    gate.unlocked = true;
    const refresh = vi.fn(async () => {});
    render(<ChatDaemonSetupPanel daemonConnected={false} onRefreshDaemon={refresh} />);
    fireEvent.click(screen.getByTestId('chat-daemon-panel-expand'));
    expect(screen.queryByTestId('chat-daemon-panel-check-failed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-daemon-panel-refresh'));
    expect(refresh).toHaveBeenCalledOnce();
    const failed = await screen.findByTestId('chat-daemon-panel-check-failed');
    expect(failed).toHaveTextContent('Still no answer on 127.0.0.1:7861');
    expect(failed).toHaveTextContent('agent.localNetworkHint');
  });
});
