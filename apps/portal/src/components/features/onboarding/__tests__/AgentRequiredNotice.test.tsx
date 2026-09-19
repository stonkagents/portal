/**
 * Purpose: The agent-required notice: hidden while the agent is connected, otherwise one
 *          sentence plus a "Set up your agent" link to the install flow; for an agent of
 *          another environment, the mismatch notice naming the build to install, with this
 *          environment's installer link. No dashes in copy.
 */
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '@/providers/I18nProvider';
import type { AgentEnvMismatch } from '@/lib/api/agent-environment';

const mockDaemon = vi.hoisted(() => ({
  connected: false,
  envMismatch: null as AgentEnvMismatch | null,
  platform: 'windows' as string,
  support: 'supported' as 'supported' | 'unsupported' | 'unknown',
  refresh: vi.fn(async () => {}),
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { downloadBaseUrl: 'https://releases.dev.stonkagents.com/', daemonUrl: 'http://127.0.0.1:7861/api/v1' },
}));
const manifest = vi.hoisted(() => ({ windows: vi.fn(), macos: vi.fn() }));
vi.mock('@/lib/api/manifest', () => ({ getWindowsInstallerUrl: manifest.windows, getMacOSInstallerUrl: manifest.macos }));

import { AgentRequiredNotice, SetUpAgentLink, useAgentRequired, AGENT_SETUP_HREF } from '../AgentRequiredNotice';
import { AgentEnvMismatchBadge } from '../AgentEnvMismatchNotice';
import { resetLocalAccessNoticeSlot } from '@/lib/installer/use-local-access-notice';

const STG_AGENT: AgentEnvMismatch = { agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' };
const MISMATCH_COPY =
  'Your installed agent is the Staging build, connected to tracker.stg.stonkagents.com. This site is Dev. Install the Dev build to use it here.';

beforeEach(() => {
  resetLocalAccessNoticeSlot();
  mockDaemon.envMismatch = null;
  mockDaemon.platform = 'windows';
  mockDaemon.support = 'supported';
  manifest.windows.mockReset().mockResolvedValue(undefined);
  manifest.macos.mockReset().mockResolvedValue(undefined);
});

describe('AgentRequiredNotice', () => {
  it('renders the notice and the setup link while the agent is offline', () => {
    mockDaemon.connected = false;
    render(<AgentRequiredNotice />, { wrapper: I18nProvider });

    const notice = screen.getByTestId('agent-required');
    expect(notice).toHaveTextContent('Available once your agent is installed and live.');
    const link = screen.getByTestId('agent-required-setup-link');
    expect(link).toHaveTextContent('Set up your agent');
    expect(link).toHaveAttribute('href', AGENT_SETUP_HREF);
    expect(AGENT_SETUP_HREF).toBe('/#onboard');
  });

  it('keeps the copy free of em and en dashes', () => {
    mockDaemon.connected = false;
    render(<AgentRequiredNotice />, { wrapper: I18nProvider });
    const text = screen.getByTestId('agent-required').textContent ?? '';
    expect(text).not.toMatch(/[–—]/);
  });

  it('renders nothing while the agent is connected', () => {
    mockDaemon.connected = true;
    render(<AgentRequiredNotice />, { wrapper: I18nProvider });
    expect(screen.queryByTestId('agent-required')).toBeNull();
  });

  it('accepts a custom test id and the panel variant', () => {
    mockDaemon.connected = false;
    render(<AgentRequiredNotice variant="panel" data-testid="custom-required" />, { wrapper: I18nProvider });
    expect(screen.getByTestId('custom-required')).toBeInTheDocument();
  });
});

describe('AgentRequiredNotice with the local network permission not granted', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the permission banner above the notice, once, however many controls render it', async () => {
    mockDaemon.connected = false;
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn(async () => ({ state: 'prompt', addEventListener: vi.fn(), removeEventListener: vi.fn() })) },
    });
    render(
      <>
        <AgentRequiredNotice data-testid="first" />
        <AgentRequiredNotice data-testid="second" />
      </>,
      { wrapper: I18nProvider },
    );
    const banner = await screen.findByTestId('local-access-notice');
    expect(banner).toHaveTextContent('This site needs permission to reach your agent on this computer.');
    expect(screen.getByTestId('local-access-notice-allow')).toHaveTextContent('Allow access');
    expect(screen.getAllByTestId('local-access-notice')).toHaveLength(1);
    expect(screen.getByTestId('first')).toBeInTheDocument();
    expect(screen.getByTestId('second')).toBeInTheDocument();
  });

  it('shows no banner when the permission is granted, or when the browser has none', async () => {
    mockDaemon.connected = false;
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn(async () => ({ state: 'granted', addEventListener: vi.fn(), removeEventListener: vi.fn() })) },
    });
    const granted = render(<AgentRequiredNotice />, { wrapper: I18nProvider });
    await waitFor(() => expect(screen.getByTestId('agent-required')).toBeInTheDocument());
    expect(screen.queryByTestId('local-access-notice')).toBeNull();
    granted.unmount();

    vi.stubGlobal('navigator', {});
    render(<AgentRequiredNotice />, { wrapper: I18nProvider });
    expect(screen.getByTestId('agent-required')).toBeInTheDocument();
    expect(screen.queryByTestId('local-access-notice')).toBeNull();
  });
});

describe('AgentRequiredNotice with an agent of another environment', () => {
  it('names the installed build, its tracker and the build this site needs, linking to this environment\'s installer', async () => {
    mockDaemon.connected = false;
    mockDaemon.envMismatch = STG_AGENT;
    manifest.windows.mockResolvedValue('https://releases.dev.stonkagents.com/StonkAgents-Setup-2.3.0.exe');
    render(<AgentRequiredNotice />, { wrapper: I18nProvider });

    const notice = screen.getByTestId('agent-env-mismatch');
    expect(notice).toHaveTextContent(MISMATCH_COPY);
    expect(notice.textContent).not.toMatch(/[–—]/);
    expect(screen.queryByTestId('agent-required')).toBeNull();
    expect(screen.queryByTestId('agent-required-setup-link')).toBeNull();

    const link = screen.getByTestId('agent-env-mismatch-download');
    expect(link).toHaveTextContent('Download the Dev build');
    /* The releases host until the manifest names the installer, then the installer itself. */
    expect(link).toHaveAttribute('href', 'https://releases.dev.stonkagents.com');
    await waitFor(() => expect(link).toHaveAttribute('href', 'https://releases.dev.stonkagents.com/StonkAgents-Setup-2.3.0.exe'));
  });

  it('keeps the caller\'s test id and marks the element as a mismatch', () => {
    mockDaemon.connected = false;
    mockDaemon.envMismatch = STG_AGENT;
    render(<AgentRequiredNotice variant="panel" data-testid="board-mine-needs-agent" />, { wrapper: I18nProvider });
    expect(screen.getByTestId('board-mine-needs-agent')).toHaveAttribute('data-env-mismatch', 'true');
  });

  it('keeps the releases host when the manifest names no installer for the platform', () => {
    mockDaemon.connected = false;
    mockDaemon.envMismatch = STG_AGENT;
    mockDaemon.platform = 'other';
    render(<AgentRequiredNotice />, { wrapper: I18nProvider });
    expect(screen.getByTestId('agent-env-mismatch-download')).toHaveAttribute('href', 'https://releases.dev.stonkagents.com');
    expect(manifest.windows).not.toHaveBeenCalled();
  });

  it('gives a disabled control the mismatch summary as its tooltip', () => {
    mockDaemon.connected = false;
    mockDaemon.envMismatch = STG_AGENT;
    const { result } = renderHook(() => useAgentRequired(), { wrapper: I18nProvider });
    expect(result.current.required).toBe(true);
    expect(result.current.title).toBe('Wrong agent build: install the Dev build to use it here.');
  });
});

describe('AgentEnvMismatchBadge', () => {
  it('is the navbar\'s badge: the summary, the full notice as tooltip, the installer as link', async () => {
    manifest.windows.mockResolvedValue('https://releases.dev.stonkagents.com/StonkAgents-Setup-2.3.0.exe');
    render(<AgentEnvMismatchBadge mismatch={STG_AGENT} />);
    const badge = screen.getByTestId('nav-env-mismatch');
    expect(badge).toHaveTextContent('Wrong agent build: install the Dev build to use it here.');
    expect(badge).toHaveAttribute('title', MISMATCH_COPY);
    await waitFor(() => expect(badge).toHaveAttribute('href', 'https://releases.dev.stonkagents.com/StonkAgents-Setup-2.3.0.exe'));
  });
});

describe('SetUpAgentLink', () => {
  it('points at the install flow on the home page', () => {
    render(<SetUpAgentLink />, { wrapper: I18nProvider });
    expect(screen.getByTestId('agent-required-setup-link')).toHaveAttribute('href', '/#onboard');
  });
});

describe('useAgentRequired', () => {
  it('reports required with a tooltip while offline', () => {
    mockDaemon.connected = false;
    const { result } = renderHook(() => useAgentRequired(), { wrapper: I18nProvider });
    expect(result.current.connected).toBe(false);
    expect(result.current.required).toBe(true);
    expect(result.current.title).toBe('Available once your agent is installed and live.');
  });

  it('reports not required with no tooltip while connected', () => {
    mockDaemon.connected = true;
    const { result } = renderHook(() => useAgentRequired(), { wrapper: I18nProvider });
    expect(result.current.connected).toBe(true);
    expect(result.current.required).toBe(false);
    expect(result.current.title).toBeUndefined();
  });
});
