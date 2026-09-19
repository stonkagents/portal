/**
 * Purpose: Tests for the "Allow local access" dialog's states (intro, denied
 *          with its three illustrated steps named for the browser, allowed,
 *          dismissed prompt, checking, bypass after two failures, and the agent
 *          probe's verdicts: mismatch, installed, update) and for the gated
 *          link: the plain link on platforms without an agent, the dialog and
 *          the download once the browser grants access, the dialog advancing
 *          on its own when the user unblocks the site in the browser's
 *          settings, and the agent probe in front of every download (nothing
 *          installed, wrong build, up to date, older).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { LocalAccessGateState } from '@/lib/installer/use-local-access-gate';

vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  STATUS_TIMEOUT_MS: 4000,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
}));

const daemon = vi.hoisted(() => ({ support: 'supported' as 'supported' | 'unsupported' | 'unknown', refresh: vi.fn(async () => {}) }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));

/* This site's release, as the manifest would report it. */
const siteRelease = vi.hoisted(() => ({ version: '2.6.1' as string | undefined }));
vi.mock('@/lib/api/manifest', () => ({
  getSiteRelease: async () =>
    siteRelease.version === undefined ? undefined : { version: siteRelease.version, releaseNotes: '', windowsInstallerUrl: undefined },
}));

/* The real English copy, without mounting the provider. */
vi.mock('@/providers/I18nProvider', async () => {
  const { en } = await import('@/lib/i18n');
  return { useTranslation: () => ({ locale: 'en', setLocale: () => {}, t: (key: string) => en[key] ?? key }) };
});

import { LocalAccessGate } from '../LocalAccessGate';
import { GatedDownloadLink } from '../GatedDownloadLink';
import { LOCAL_ACCESS_GRANTED_KEY } from '@/lib/installer/local-network-access';
import { AGENT_HEALTH_URL, AGENT_STATUS_URL } from '@/lib/installer/installed-agent';
import { ALLOWED_NOTICE_MS, MISMATCH_NOTICE_MS } from '@/lib/installer/use-local-access-gate';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const EDGE_UA = `${CHROME_UA} Edg/140.0.0.0`;
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const userAgentSpies: Array<{ mockRestore: () => void }> = [];
function withUserAgent(ua: string) {
  userAgentSpies.push(vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua));
}

function gateState(overrides: Partial<LocalAccessGateState> = {}): LocalAccessGateState {
  return {
    phase: 'intro',
    attempts: 0,
    canBypass: false,
    agent: null,
    attempt: vi.fn(async () => {}),
    checkAgent: vi.fn(async () => true),
    bypass: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

const DASHES = new RegExp(String.fromCharCode(0x2013) + '|' + String.fromCharCode(0x2014));

describe('LocalAccessGate', () => {
  afterEach(() => {
    for (const spy of userAgentSpies.splice(0)) spy.mockRestore();
  });

  it('explains, then Allow and download runs the check', () => {
    const gate = gateState();
    render(<LocalAccessGate open onClose={vi.fn()} gate={gate} />);
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'intro');
    expect(screen.getByText('Allow local access')).toBeInTheDocument();
    expect(screen.getByText(/needs to talk to the agent running on this computer/)).toBeInTheDocument();
    const allow = screen.getByTestId('local-access-allow');
    expect(allow).toHaveTextContent('Allow and download');
    expect(allow).toHaveFocus();
    fireEvent.click(allow);
    expect(gate.attempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('local-access-denied')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-access-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-access-bypass')).not.toBeInTheDocument();
  });

  describe('denied: three illustrated steps to unblock it, with Recheck', () => {
    function renderDenied() {
      const { unmount } = render(<LocalAccessGate open onClose={vi.fn()} gate={gateState({ phase: 'denied', attempts: 1 })} />);
      expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'denied');
      const fix = screen.getByTestId('local-access-denied');
      expect(fix).toHaveAttribute('role', 'alert');
      expect(fix).toHaveTextContent('will not ask again on its own');
      expect(screen.queryByText(/needs to talk to the agent running on this computer/)).not.toBeInTheDocument();
      const steps = screen.getByTestId('local-access-steps');
      expect(steps.tagName).toBe('OL');
      const items = steps.querySelectorAll(':scope > li');
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent('Click the icon at the left of the address bar.');
      expect(items[2]).toHaveTextContent('Come back here and press Recheck.');
      expect(screen.getByTestId('local-access-allow')).toHaveTextContent('Recheck');
      const bar = screen.getByTestId('local-access-figure-address-bar');
      expect(bar).toHaveAttribute('role', 'img');
      expect(bar).toHaveAttribute('aria-label', 'A browser address bar; the site settings icon at its left is highlighted.');
      expect(bar).toHaveTextContent(window.location.hostname);
      const panel = screen.getByTestId('local-access-figure-panel');
      expect(panel).toHaveAttribute('role', 'img');
      return { steps, step2: items[1], bar, panel, unmount };
    }

    it('Chrome: the sliders icon, the Apps on device toggle and Reset permissions', () => {
      withUserAgent(CHROME_UA);
      const { steps, step2, bar, panel } = renderDenied();
      expect(steps).toHaveAttribute('data-browser', 'chrome');
      expect(bar).toHaveAttribute('data-icon', 'sliders');
      expect(step2).toHaveTextContent('Find Apps on device and switch it on, or press Reset permissions.');
      expect(panel).toHaveTextContent('Apps on device');
      expect(panel).toHaveTextContent('Reset permissions');
      expect(panel).toHaveAttribute(
        'aria-label',
        'The site settings panel: the Apps on device switch is on, with a Reset permissions button below it.',
      );
    });

    it('Edge: the same panel as Chrome', () => {
      withUserAgent(EDGE_UA);
      const { steps, bar, step2 } = renderDenied();
      expect(steps).toHaveAttribute('data-browser', 'edge');
      expect(bar).toHaveAttribute('data-icon', 'sliders');
      expect(step2).toHaveTextContent('Find Apps on device and switch it on, or press Reset permissions.');
    });

    it('Firefox and Safari: the lock icon and the Local network access row, no Reset permissions', () => {
      withUserAgent(FIREFOX_UA);
      const firefox = renderDenied();
      expect(firefox.steps).toHaveAttribute('data-browser', 'firefox');
      expect(firefox.bar).toHaveAttribute('data-icon', 'lock');
      expect(firefox.step2).toHaveTextContent('Find Local network access and set it to Allow.');
      expect(firefox.panel).toHaveTextContent('Local network access');
      expect(firefox.panel).not.toHaveTextContent('Reset permissions');
      expect(firefox.panel).toHaveAttribute('aria-label', 'The site settings panel: the Local network access switch is on.');
      for (const spy of userAgentSpies.splice(0)) spy.mockRestore();
      firefox.unmount();

      withUserAgent(SAFARI_UA);
      const safari = renderDenied();
      expect(safari.steps).toHaveAttribute('data-browser', 'safari');
      expect(safari.bar).toHaveAttribute('data-icon', 'lock');
    });

    it('an unknown browser gets generic wording', () => {
      withUserAgent('SomethingElse/1.0');
      const { steps, step2, panel } = renderDenied();
      expect(steps).toHaveAttribute('data-browser', 'unknown');
      expect(step2).toHaveTextContent('Find the local network setting and switch it on.');
      expect(panel).toHaveTextContent('Local network');
      expect(panel).not.toHaveTextContent('Reset permissions');
    });
  });

  it('allowed: says access is allowed and offers nothing to press, the probe follows on its own', () => {
    render(<LocalAccessGate open onClose={vi.fn()} gate={gateState({ phase: 'allowed', attempts: 2, canBypass: true })} />);
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'allowed');
    expect(screen.getByTestId('local-access-allowed')).toHaveTextContent('Access allowed');
    expect(screen.queryByTestId('local-access-allow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-access-bypass')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-access-steps')).not.toBeInTheDocument();
  });

  it('asks for the browser prompt to be answered, with Try again, when it was dismissed', () => {
    render(<LocalAccessGate open onClose={vi.fn()} gate={gateState({ phase: 'prompt', attempts: 1 })} />);
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'prompt');
    expect(screen.getByTestId('local-access-prompt')).toHaveTextContent('Choose Allow in the browser prompt');
    expect(screen.getByTestId('local-access-allow')).toHaveTextContent('Try again');
  });

  it('disables the action while the browser is asking', () => {
    render(<LocalAccessGate open onClose={vi.fn()} gate={gateState({ phase: 'checking' })} />);
    const allow = screen.getByTestId('local-access-allow');
    expect(allow).toBeDisabled();
    expect(allow).toHaveTextContent('Waiting for the browser');
  });

  it('offers Download anyway after two failed attempts', () => {
    const gate = gateState({ phase: 'prompt', attempts: 2, canBypass: true });
    render(<LocalAccessGate open onClose={vi.fn()} gate={gate} />);
    fireEvent.click(screen.getByTestId('local-access-bypass'));
    expect(gate.bypass).toHaveBeenCalledTimes(1);
  });

  it('wrong build: one line naming both builds, no button, the download follows on its own', () => {
    const gate = gateState({
      phase: 'mismatch',
      agent: { kind: 'mismatch', mismatch: { agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' } },
    });
    render(<LocalAccessGate open onClose={vi.fn()} gate={gate} />);
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'mismatch');
    expect(screen.getByTestId('local-access-mismatch')).toHaveTextContent(
      'Your installed agent is the Staging build; this site needs the Dev build. Downloading it.',
    );
    expect(screen.queryByTestId('local-access-allow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-access-bypass')).not.toBeInTheDocument();
  });

  it('wrong build of unknown environment: "another build"', () => {
    const gate = gateState({
      phase: 'mismatch',
      agent: { kind: 'mismatch', mismatch: { agentEnv: null, agentTrackerHost: 'tracker.example.test', siteEnv: 'prd' } },
    });
    render(<LocalAccessGate open onClose={vi.fn()} gate={gate} />);
    expect(screen.getByTestId('local-access-mismatch')).toHaveTextContent(
      'Your installed agent is another build; this site needs the Production build.',
    );
  });

  it('installed: says there is nothing to download, Close has focus, Download anyway is the bypass', () => {
    const onClose = vi.fn();
    const gate = gateState({ phase: 'installed', agent: { kind: 'installed', version: '2.6.1' } });
    render(<LocalAccessGate open onClose={onClose} gate={gate} />);
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'installed');
    expect(screen.getByTestId('local-access-installed')).toHaveTextContent(
      'Your agent v2.6.1 is already installed and up to date on this computer. There is nothing to download.',
    );
    expect(screen.queryByText(/needs to talk to the agent running on this computer/)).not.toBeInTheDocument();
    const close = screen.getByTestId('local-access-close');
    expect(close).toHaveTextContent('Close');
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('local-access-bypass'));
    expect(gate.bypass).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('local-access-allow')).not.toBeInTheDocument();
  });

  it('update: names both versions, Download update has focus and proceeds, Not now closes', () => {
    const onClose = vi.fn();
    const gate = gateState({ phase: 'update', agent: { kind: 'update', current: '2.5.0', latest: '2.6.1' } });
    render(<LocalAccessGate open onClose={onClose} gate={gate} />);
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'update');
    expect(screen.getByTestId('local-access-update')).toHaveTextContent(
      'Your agent v2.5.0 is installed; v2.6.1 is available. The update keeps your identity, keys and history.',
    );
    const download = screen.getByTestId('local-access-download-update');
    expect(download).toHaveTextContent('Download update');
    expect(download).toHaveFocus();
    fireEvent.click(download);
    expect(gate.bypass).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('local-access-not-now'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn();
    render(<LocalAccessGate open onClose={onClose} gate={gateState()} />);
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' });
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('uses no em or en dash anywhere in its copy', () => {
    const states: Partial<LocalAccessGateState>[] = [
      { phase: 'intro' },
      { phase: 'denied' },
      { phase: 'allowed' },
      { phase: 'prompt' },
      { phase: 'mismatch', agent: { kind: 'mismatch', mismatch: { agentEnv: 'prd', agentTrackerHost: '', siteEnv: 'stg' } } },
      { phase: 'installed', agent: { kind: 'installed', version: '2.6.1' } },
      { phase: 'update', agent: { kind: 'update', current: '2.5.0', latest: '2.6.1' } },
    ];
    for (const state of states) {
      const { unmount } = render(
        <LocalAccessGate open onClose={vi.fn()} gate={gateState({ attempts: 2, canBypass: true, ...state })} />,
      );
      expect(screen.getByTestId('modal').textContent).not.toMatch(DASHES);
      unmount();
    }
  });
});

/** A fetch that answers as an installed agent would; undefined health means nothing is installed. */
function agentFetch(health: Record<string, unknown> | undefined, status: Record<string, unknown> = {}) {
  return vi.fn(async (url: string) => {
    if (url === AGENT_HEALTH_URL && health) return { ok: true, json: async () => health } as unknown as Response;
    if (url === AGENT_STATUS_URL && health) return { ok: true, json: async () => status } as unknown as Response;
    throw new TypeError('Failed to fetch');
  });
}

const devStatus = { tracker_url: 'https://tracker.dev.stonkagents.com', environment: 'dev' };

describe('GatedDownloadLink', () => {
  const href = 'https://releases.example.test/StonkAgents-Setup-2.6.1.exe';

  function renderLink(onDownload = vi.fn()) {
    const utils = render(
      <GatedDownloadLink href={href} onDownload={onDownload} data-testid="download-installer">
        Download
      </GatedDownloadLink>,
    );
    return { ...utils, onDownload, link: screen.getByTestId('download-installer') };
  }

  beforeEach(() => {
    sessionStorage.clear();
    daemon.support = 'supported';
    daemon.refresh.mockClear();
    siteRelease.version = '2.6.1';
    /* Nothing installed unless a test says otherwise; no test here may reach a real agent. */
    vi.stubGlobal('fetch', agentFetch(undefined));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is a plain link that arms the install watch on platforms without an agent', () => {
    daemon.support = 'unsupported';
    vi.stubGlobal('navigator', {});
    const { link, onDownload } = renderLink();
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(fireEvent.click(link)).toBe(true);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
  });

  it('without a local network permission (Firefox, Safari) still probes the agent before the download', async () => {
    vi.stubGlobal('navigator', {});
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
    const { link, onDownload } = renderLink();
    expect(fireEvent.click(link)).toBe(false);
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(AGENT_HEALTH_URL, expect.anything());
    expect(open).toHaveBeenCalledWith(href, '_blank');
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
    open.mockRestore();
  });

  it('reads the permission live on every click: a remembered grant does not skip the gate once the user blocked it', async () => {
    const status = { state: 'denied', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    sessionStorage.setItem(LOCAL_ACCESS_GRANTED_KEY, '1');
    const onDownload = vi.fn();
    const { unmount } = renderLink(onDownload);
    expect(fireEvent.click(screen.getByTestId('download-installer'))).toBe(false);
    await waitFor(() => expect(screen.getByTestId('modal')).toHaveAttribute('open'));
    expect(onDownload).not.toHaveBeenCalled();
    unmount();

    /* Granted right now and nothing installed: no dialog, the download starts. */
    status.state = 'granted';
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
    const { unmount: unmount2 } = renderLink(onDownload);
    expect(fireEvent.click(screen.getByTestId('download-installer'))).toBe(false);
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalled();
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
    open.mockRestore();
    unmount2();
  });

  it('opens the dialog instead of downloading, then downloads once the browser grants access and nothing is installed', async () => {
    const status = { state: 'prompt', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    // The probe: the browser asks, the user allows, the fetch fails because nothing is installed yet.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        status.state = 'granted';
        throw new TypeError('Failed to fetch');
      }),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
    const { link, onDownload } = renderLink();
    expect(fireEvent.click(link)).toBe(false);
    await waitFor(() => expect(screen.getByTestId('modal')).toHaveAttribute('open'));
    expect(onDownload).not.toHaveBeenCalled();
    expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'intro');

    fireEvent.click(screen.getByTestId('local-access-allow'));
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith(href, '_blank');
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBe('1');
    open.mockRestore();
  });

  it('keeps the dialog open with the fix when the browser reports the permission denied', async () => {
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'denied', addEventListener: vi.fn() })) } });
    const { link, onDownload } = renderLink();
    await waitFor(() => expect(fireEvent.click(link)).toBe(false));
    fireEvent.click(screen.getByTestId('local-access-allow'));
    await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'denied'));
    expect(onDownload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalledWith(AGENT_HEALTH_URL, expect.anything());
    expect(screen.getByTestId('local-access-allow')).toHaveTextContent('Recheck');
  });

  it('denied, then unblocked in the site settings: the dialog notices the change on its own, says Access allowed, and downloads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listeners: Array<() => void> = [];
    const status = {
      state: 'denied',
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
    const { link, onDownload } = renderLink();
    await waitFor(() => expect(fireEvent.click(link)).toBe(false));
    await waitFor(() => expect(screen.getByTestId('modal')).toHaveAttribute('open'));
    fireEvent.click(screen.getByTestId('local-access-allow'));
    await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'denied'));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

    /* The user flips the row in the browser's site settings: the PermissionStatus fires "change". */
    status.state = 'granted';
    await act(async () => {
      for (const listener of listeners) listener();
    });
    await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'allowed'));
    expect(screen.getByTestId('local-access-allowed')).toHaveTextContent('Access allowed');
    expect(screen.queryByTestId('local-access-allow')).not.toBeInTheDocument();
    expect(onDownload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBe('1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ALLOWED_NOTICE_MS);
    });
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(AGENT_HEALTH_URL, expect.anything());
    expect(open).toHaveBeenCalledWith(href, '_blank');
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
    open.mockRestore();
  });

  describe('the agent probe in front of the download (permission granted)', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'granted', addEventListener: vi.fn() })) } });
    });

    it('up to date: opens the dialog on "installed", downloads nothing, and refreshes the site\'s view of the agent', async () => {
      vi.stubGlobal('fetch', agentFetch({ status: 'healthy', version: '2.6.1' }, devStatus));
      const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
      const { link, onDownload } = renderLink();
      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'installed'));
      expect(screen.getByTestId('modal')).toHaveAttribute('open');
      expect(screen.getByTestId('local-access-installed')).toHaveTextContent('Your agent v2.6.1 is already installed and up to date');
      expect(onDownload).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(daemon.refresh).toHaveBeenCalledTimes(1);

      /* Close leaves nothing behind; Download anyway is a reinstall. */
      fireEvent.click(screen.getByTestId('local-access-close'));
      await waitFor(() => expect(screen.getByTestId('modal')).not.toHaveAttribute('open'));
      expect(onDownload).not.toHaveBeenCalled();

      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'installed'));
      fireEvent.click(screen.getByTestId('local-access-bypass'));
      await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
      expect(open).toHaveBeenCalledWith(href, '_blank');
      expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
      open.mockRestore();
    });

    it('newer than the site, or a site whose manifest is down: also "installed", never the exe over a working agent', async () => {
      vi.stubGlobal('fetch', agentFetch({ status: 'healthy', version: '2.7.0' }, devStatus));
      const { link, onDownload, unmount } = renderLink();
      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'installed'));
      expect(screen.getByTestId('local-access-installed')).toHaveTextContent('v2.7.0');
      expect(onDownload).not.toHaveBeenCalled();
      unmount();

      siteRelease.version = undefined;
      vi.stubGlobal('fetch', agentFetch({ status: 'healthy', version: '1.0.0' }, devStatus));
      const second = renderLink();
      expect(fireEvent.click(second.link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'installed'));
      expect(second.onDownload).not.toHaveBeenCalled();
    });

    it('older: offers the update; Download update downloads, Not now closes without a download', async () => {
      vi.stubGlobal('fetch', agentFetch({ status: 'healthy', version: '2.5.0' }, devStatus));
      const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
      const { link, onDownload } = renderLink();
      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'update'));
      expect(screen.getByTestId('local-access-update')).toHaveTextContent('Your agent v2.5.0 is installed; v2.6.1 is available.');
      expect(daemon.refresh).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('local-access-not-now'));
      await waitFor(() => expect(screen.getByTestId('modal')).not.toHaveAttribute('open'));
      expect(onDownload).not.toHaveBeenCalled();

      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'update'));
      fireEvent.click(screen.getByTestId('local-access-download-update'));
      await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
      expect(open).toHaveBeenCalledWith(href, '_blank');
      expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
      open.mockRestore();
    });

    it("wrong build: shows the mismatch line, then downloads this site's build without another click", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal(
        'fetch',
        agentFetch(
          { status: 'healthy', version: '9.9.9' },
          { tracker_url: 'https://tracker.stg.stonkagents.com', environment: 'stg' },
        ),
      );
      const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
      const { link, onDownload } = renderLink();
      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'mismatch'));
      expect(screen.getByTestId('local-access-mismatch')).toHaveTextContent(
        'Your installed agent is the Staging build; this site needs the Dev build. Downloading it.',
      );
      expect(onDownload).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(MISMATCH_NOTICE_MS);
      });
      expect(onDownload).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith(href, '_blank');
      expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
      open.mockRestore();
    });

    it('marks the link busy while the probe runs and ignores a second click meanwhile', async () => {
      let answer!: () => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((_, reject) => {
              answer = () => reject(new TypeError('Failed to fetch'));
            }),
        ),
      );
      const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
      const { link, onDownload } = renderLink();
      expect(fireEvent.click(link)).toBe(false);
      await waitFor(() => expect(link).toHaveAttribute('aria-busy', 'true'));
      expect(fireEvent.click(link)).toBe(false);
      await act(async () => {
        answer();
      });
      await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
      expect(link).not.toHaveAttribute('aria-busy');
      expect(fetch).toHaveBeenCalledTimes(1);
      open.mockRestore();
    });
  });
});
