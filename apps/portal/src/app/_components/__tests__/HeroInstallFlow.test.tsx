/**
 * Purpose: Tests for HeroInstallFlow (RUN-1) — the one Run your Agent flow in its
 *          Install → Permissions → Live frame; honest coming-soon off Windows; no
 *          guessed download; real permissions rows; real peer id at Live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DaemonSetup } from '@/components/features/onboarding/use-daemon-setup';
import type { InstallerDownloads } from '@/lib/installer/use-installer-downloads';

const daemon = vi.hoisted(() => ({
  connected: false,
  support: 'supported' as 'unknown' | 'supported' | 'unsupported',
  platform: 'windows' as string,
  health: { peerId: '' },
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

const openInterest = vi.hoisted(() => vi.fn());
vi.mock('@/components/features/interest', () => ({ useInterest: () => ({ open: openInterest }) }));

vi.mock('@/components/ui', () => ({ Icon: () => <span /> }));
vi.mock('@/components/brand/ClawMascot', () => ({ ClawMascot: () => <div data-testid="mascot" /> }));

/* The copy names the agent by the address the env configures (dev: 127.0.0.1:7861), never a fixed port. */
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://127.0.0.1:7861/api/v1', downloadBaseUrl: 'https://releases.dev.example' },
}));

import { HeroInstallFlow } from '../HeroInstallFlow';

function setup(overrides: Partial<DaemonSetup> = {}): DaemonSetup {
  return {
    state: 'idle',
    status: null,
    fixing: null,
    fixError: null,
    fixNote: null,
    applyFix: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    ...overrides,
  };
}

const base = {
  installStep: 'idle' as const,
  installTimeout: false,
  setInstallTimeout: vi.fn(),
  installStartRef: { current: 0 },
  installerUnlocked: true,
  os: 'windows' as const,
  downloadUrl: 'https://releases.example.test/StonkAgents-Setup-0.4.0.exe' as string | undefined,
  downloads: { macos: undefined, windows: 'https://releases.example.test/StonkAgents-Setup-0.4.0.exe' } as InstallerDownloads,
  handleDownload: vi.fn(),
  manifestState: 'ready' as const,
  retryDownloads: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  daemon.connected = false;
  daemon.support = 'supported';
  daemon.platform = 'windows';
  daemon.health = { peerId: '' };
});

describe('frame', () => {
  it('renders Install → Permissions → Live with the current step marked, and none of the prototype', () => {
    render(<HeroInstallFlow {...base} agentStage="install" />);
    expect(screen.getByTestId('run-agent-flow')).toHaveAttribute('data-stage', 'install');
    expect(screen.getByTestId('run-agent-step-install')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('run-agent-step-permissions')).toHaveAttribute('data-state', 'pending');
    expect(screen.getByTestId('run-agent-step-live')).toHaveAttribute('data-state', 'pending');
    expect(screen.queryByText(/npm install/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Docker/)).not.toBeInTheDocument();
    expect(screen.queryByText(/12D3KooWRf/)).not.toBeInTheDocument();
  });

  it('derives the stage from the daemon when the caller has no setup state (chat panel)', () => {
    daemon.connected = true;
    render(<HeroInstallFlow {...base} />);
    expect(screen.getByTestId('run-agent-flow')).toHaveAttribute('data-stage', 'live');
  });
});

describe('Install before the token is launched (locked)', () => {
  const LOCKED_LINE = 'Launch your token first. The installer unlocks right after.';

  it('keeps the three-step frame but shows the placeholder line and no download, even with a manifest URL in hand', () => {
    render(<HeroInstallFlow {...base} agentStage="install" installerUnlocked={false} />);
    expect(screen.getByText('Run your Agent')).toBeInTheDocument();
    expect(screen.getByTestId('run-agent-step-install')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('run-agent-step-permissions')).toBeInTheDocument();
    expect(screen.getByTestId('run-agent-step-live')).toBeInTheDocument();
    expect(screen.getByTestId('installer-locked')).toHaveTextContent(LOCKED_LINE);
    expect(screen.queryByTestId('download-installer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('download-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('download-unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/Download for Windows/)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('.exe');
  });

  it('offers no copy-link either on a platform without an installer', () => {
    daemon.support = 'unsupported';
    daemon.platform = 'macos';
    render(<HeroInstallFlow {...base} agentStage="install" os="macos" downloadUrl={undefined} installerUnlocked={false} />);
    expect(screen.getByTestId('installer-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('copy-desktop-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('install-coming-soon')).not.toBeInTheDocument();
  });

  it('uses no em or en dash in the placeholder copy', () => {
    render(<HeroInstallFlow {...base} agentStage="install" installerUnlocked={false} />);
    expect(screen.getByTestId('installer-locked').textContent).not.toMatch(/[–—]/);
  });
});

describe('Install on Windows', () => {
  it('offers the manifest-backed installer and arms detection on click, once the agent probe found nothing installed', async () => {
    /* The click probes the agent before the download (GatedDownloadLink); nothing answers here, and no real agent is ever reached. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
    render(<HeroInstallFlow {...base} agentStage="install" />);
    const link = screen.getByTestId('download-installer');
    expect(link).toHaveAttribute('href', 'https://releases.example.test/StonkAgents-Setup-0.4.0.exe');
    expect(link).toHaveTextContent('Download for Windows');
    fireEvent.click(link);
    await waitFor(() => expect(base.handleDownload).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith('https://releases.example.test/StonkAgents-Setup-0.4.0.exe', '_blank');
    open.mockRestore();
    vi.unstubAllGlobals();
  });

  it('names the browser, SmartScreen and firewall prompts of an unsigned installer before the click', () => {
    render(<HeroInstallFlow {...base} agentStage="install" />);
    const notes = screen.getByTestId('download-windows-notes');
    expect(notes).toHaveTextContent('choose Keep');
    expect(notes).toHaveTextContent('More info, then Run anyway');
    expect(notes).toHaveTextContent('Windows Firewall');
    expect(notes.textContent).not.toMatch(/[–—]/);
  });

  it('says "Download unavailable, try again" instead of guessing a URL when the manifest is unreachable', () => {
    render(<HeroInstallFlow {...base} agentStage="install" downloadUrl={undefined} manifestState="unavailable" />);
    expect(screen.queryByTestId('download-installer')).not.toBeInTheDocument();
    const retry = screen.getByTestId('download-unavailable');
    expect(retry).toHaveTextContent('Download unavailable, try again');
    fireEvent.click(retry);
    expect(base.retryDownloads).toHaveBeenCalledOnce();
  });

  it('shows the detection stepper and the timeout retry', () => {
    render(<HeroInstallFlow {...base} agentStage="install" installStep="detecting" installTimeout />);
    expect(screen.getByTestId('install-stepper')).toBeInTheDocument();
    expect(screen.getByText(/Detecting your agent on 127\.0\.0\.1:7861/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('localhost:7841');
    const timeout = screen.getByTestId('install-timeout');
    expect(timeout).toHaveTextContent('running on 127.0.0.1:7861');
    // The browser's local network permission is the usual reason a running agent is "not detected".
    expect(timeout).toHaveTextContent('agent.localNetworkHint');
    fireEvent.click(screen.getByTestId('install-retry'));
    expect(base.setInstallTimeout).toHaveBeenCalledWith(false);
  });
});

describe('Install elsewhere', () => {
  it('is one honest coming-soon state on macOS with a copy-link action and a roadmap-interest hook', async () => {
    daemon.support = 'unsupported';
    daemon.platform = 'macos';
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HeroInstallFlow {...base} agentStage="install" os="macos" downloadUrl={undefined} />);
    expect(screen.getByTestId('install-coming-soon')).toHaveTextContent('Coming soon for macOS and as a Cloud Agent.');
    expect(screen.queryByTestId('download-installer')).not.toBeInTheDocument();
    expect(screen.queryByText(/\.dmg/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('copy-desktop-link'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://releases.example.test/StonkAgents-Setup-0.4.0.exe'));
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link copied' }));
    fireEvent.click(screen.getByTestId('coming-soon-feedback'));
    expect(openInterest).toHaveBeenCalledTimes(1);
  });
});

describe('Permissions', () => {
  const blocked = {
    checks: [
      { id: 'service' as const, status: 'ok' as const },
      { id: 'controller' as const, status: 'ok' as const },
      { id: 'firewall' as const, status: 'missing' as const, message: 'No firewall rule for your agent' },
      { id: 'p2p' as const, status: 'ok' as const },
      { id: 'tracker' as const, status: 'ok' as const },
      { id: 'storage' as const, status: 'ok' as const },
      { id: 'bandwidth' as const, status: 'ok' as const },
      { id: 'autostart' as const, status: 'failed' as const },
      { id: 'origin' as const, status: 'ok' as const },
    ],
  };

  it('shows a checking line before the first answer', () => {
    render(<HeroInstallFlow {...base} agentStage="permissions" setup={setup({ state: 'checking' })} />);
    expect(screen.getByTestId('permissions-checking')).toBeInTheDocument();
  });

  it('renders the three rows from real checks, Grant POSTs the fix, Launch is disabled until green', () => {
    const applyFix = vi.fn(async () => {});
    render(<HeroInstallFlow {...base} agentStage="permissions" setup={setup({ state: 'blocked', status: blocked, applyFix })} />);
    expect(screen.getByTestId('perm-row-network')).toHaveAttribute('data-status', 'missing');
    expect(screen.getByTestId('perm-row-network')).toHaveTextContent('No firewall rule for your agent');
    expect(screen.getByTestId('perm-row-storage')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('perm-row-bandwidth')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('perm-status-autostart')).toHaveAttribute('data-status', 'failed');
    expect(screen.getByTestId('perm-status-service')).toHaveAttribute('data-status', 'ok');
    fireEvent.click(screen.getByTestId('perm-fix-network'));
    expect(applyFix).toHaveBeenCalledWith('firewall');
    expect(screen.getByTestId('permissions-launch')).toBeDisabled();
    expect(screen.getByText('Grant every red row to continue')).toBeInTheDocument();
    expect(screen.queryByTestId('permissions-settling')).not.toBeInTheDocument();
  });

  it('never walls the visitor behind a check with no Grant: P2P and tracker still settling are a note with Recheck, Launch stays enabled', () => {
    const confirmSetup = vi.fn();
    const refresh = vi.fn(async () => {});
    const settling = {
      checks: blocked.checks.map(c =>
        c.id === 'p2p'
          ? { ...c, status: 'failed' as const, message: 'neither the DHT nor a relay is available; peers cannot reach this agent' }
          : c.id === 'tracker'
            ? { ...c, status: 'missing' as const, message: 'tracker registration pending' }
            : { ...c, status: 'ok' as const },
      ),
    };
    render(
      <HeroInstallFlow
        {...base}
        agentStage="permissions"
        confirmSetup={confirmSetup}
        setup={setup({ state: 'ready', status: settling, refresh })}
      />,
    );
    expect(screen.getByTestId('perm-row-network')).toHaveAttribute('data-status', 'failed');
    expect(screen.queryByTestId('perm-fix-network')).not.toBeInTheDocument();
    const note = screen.getByTestId('permissions-settling');
    expect(note).toHaveTextContent('Still settling: P2P network, tracker registration');
    expect(note).toHaveTextContent('neither the DHT nor a relay is available');
    fireEvent.click(screen.getByTestId('permissions-recheck'));
    expect(refresh).toHaveBeenCalledOnce();
    const launch = screen.getByTestId('permissions-launch');
    expect(launch).toBeEnabled();
    fireEvent.click(launch);
    expect(confirmSetup).toHaveBeenCalledOnce();
  });

  it('reads a fixable check the agent could not finish in time as slow, not denied, and does not block on it', () => {
    const slow = {
      checks: blocked.checks.map(c =>
        c.id === 'firewall' ? { ...c, status: 'failed' as const, message: 'check did not finish within 8s' } : { ...c, status: 'ok' as const },
      ),
    };
    render(<HeroInstallFlow {...base} agentStage="permissions" setup={setup({ state: 'ready', status: slow })} />);
    expect(screen.getByTestId('perm-row-network')).toHaveTextContent('Still checking. This can take a moment on first run');
    expect(screen.getByTestId('permissions-settling')).toHaveTextContent('Still settling: firewall rule');
    expect(screen.getByTestId('permissions-launch')).toBeEnabled();
  });

  it('enables Launch your agent only when every check is ok', () => {
    const confirmSetup = vi.fn();
    const green = { checks: blocked.checks.map(c => ({ ...c, status: 'ok' as const })) };
    render(
      <HeroInstallFlow
        {...base}
        agentStage="permissions"
        confirmSetup={confirmSetup}
        setup={setup({ state: 'ready', status: green })}
      />,
    );
    const launch = screen.getByTestId('permissions-launch');
    expect(launch).toBeEnabled();
    fireEvent.click(launch);
    expect(confirmSetup).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(/perm-fix-/)).not.toBeInTheDocument();
  });

  it('surfaces a fix error', () => {
    render(
      <HeroInstallFlow
        {...base}
        agentStage="permissions"
        setup={setup({ state: 'blocked', status: blocked, fixError: 'Elevation was refused' })}
      />,
    );
    expect(screen.getByTestId('permissions-fix-error')).toHaveTextContent('Elevation was refused');
  });
});

describe('Live', () => {
  it('shows the real peer id, the binding line while the claim is in flight, and exactly one action', () => {
    daemon.connected = true;
    daemon.health = { peerId: '12D3KooWRealPeerIdFromHealthEndpoint0000' };
    render(<HeroInstallFlow {...base} agentStage="live" installStep="live" claimStatus="claiming" />);
    expect(screen.getByTestId('live-peer-id')).toHaveTextContent('12D3KooWRealPeer...0000');
    expect(screen.getByTestId('live-binding')).toHaveTextContent('Binding it to your token now');
    expect(screen.getByTestId('live-browse-knowledge')).toHaveAttribute('href', '/gallery');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText(/Reputation|Platforms/)).not.toBeInTheDocument();
  });

  it('names a tracker registration still settling at Live, where nothing waited on it', () => {
    daemon.connected = true;
    const status = { checks: [{ id: 'tracker' as const, status: 'failed' as const, message: 'last tracker registration failed: 503' }] };
    render(<HeroInstallFlow {...base} agentStage="live" installStep="fork" setup={setup({ state: 'ready', status })} />);
    expect(screen.getByTestId('live-settling')).toHaveTextContent('Still settling: tracker registration (last tracker registration failed: 503)');
  });

  it('does not show the binding line outside the claim call, and notes the pre-endpoint case', () => {
    daemon.connected = true;
    render(
      <HeroInstallFlow {...base} agentStage="live" installStep="live" claimStatus="idle" setup={setup({ state: 'unsupported' })} />,
    );
    expect(screen.queryByTestId('live-binding')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-setup-update')).toHaveTextContent('Your agent needs an update to finish setup.');
    expect(screen.getByTestId('run-agent-step-permissions')).toHaveTextContent('(skipped)');
  });
});
