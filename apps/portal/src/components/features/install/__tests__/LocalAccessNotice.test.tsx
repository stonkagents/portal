/**
 * Purpose: Tests for the "needs permission" banner: hidden when the permission
 *          is granted, absent, the platform runs no agent, or the agent is
 *          connected; shown on prompt and denied; "Allow access" opens the
 *          dialog in access mode and fires the browser prompt at once; granted
 *          closes it and refreshes the agent poll; denied shows the fix with
 *          Recheck and no bypass; the change event clears the banner; one banner
 *          per page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  STATUS_TIMEOUT_MS: 4000,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
}));

const daemon = vi.hoisted(() => ({
  support: 'supported' as 'supported' | 'unsupported' | 'unknown',
  connected: false,
  refresh: vi.fn(async () => {}),
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));

vi.mock('@/providers/I18nProvider', async () => {
  const { en } = await import('@/lib/i18n');
  return { useTranslation: () => ({ locale: 'en', setLocale: () => {}, t: (key: string) => en[key] ?? key }) };
});

import { LocalAccessNotice } from '../LocalAccessNotice';
import { resetLocalAccessNoticeSlot } from '@/lib/installer/use-local-access-notice';
import { ALLOWED_NOTICE_MS } from '@/lib/installer/use-local-access-gate';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function fakeStatus(state: string) {
  const listeners = new Set<() => void>();
  const status = {
    state,
    addEventListener: vi.fn((_type: string, cb: () => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_type: string, cb: () => void) => listeners.delete(cb)),
    set(next: string) {
      status.state = next;
      for (const cb of listeners) cb();
    },
  };
  return status;
}

beforeEach(() => {
  resetLocalAccessNoticeSlot();
  daemon.support = 'supported';
  daemon.connected = false;
  daemon.refresh.mockClear();
  /* No test here may reach a real agent. */
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LocalAccessNotice', () => {
  it('renders nothing without the permission API, when granted, on unsupported platforms, or once connected', async () => {
    vi.stubGlobal('navigator', {});
    const none = render(<LocalAccessNotice />);
    expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument();
    none.unmount();

    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => fakeStatus('granted')) } });
    const granted = render(<LocalAccessNotice />);
    await act(async () => {});
    expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument();
    granted.unmount();

    const status = fakeStatus('prompt');
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    daemon.support = 'unsupported';
    const unsupported = render(<LocalAccessNotice />);
    await act(async () => {});
    expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument();
    unsupported.unmount();

    daemon.support = 'supported';
    daemon.connected = true;
    render(<LocalAccessNotice />);
    await act(async () => {});
    expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument();
  });

  it('shows on prompt and denied, and clears itself when the browser reports the permission granted', async () => {
    const status = fakeStatus('denied');
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    render(<LocalAccessNotice />);
    const notice = await screen.findByTestId('local-access-notice');
    expect(notice).toHaveTextContent('This site needs permission to reach your agent on this computer.');
    expect(screen.getByTestId('local-access-notice-allow')).toHaveTextContent('Allow access');
    expect(notice.textContent).not.toMatch(new RegExp(String.fromCharCode(0x2013) + '|' + String.fromCharCode(0x2014)));
    act(() => status.set('prompt'));
    expect(screen.getByTestId('local-access-notice')).toBeInTheDocument();
    act(() => status.set('granted'));
    expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument();
  });

  it('Allow access opens the dialog in access mode, asks the browser at once, and on granted closes it and refreshes the agent', async () => {
    const status = fakeStatus('prompt');
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    /* The probe: the browser asks; the test plays the user who allows. */
    let allowInBrowser!: () => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((_, reject) => {
            allowInBrowser = () => {
              status.set('granted');
              reject(new TypeError('Failed to fetch'));
            };
          }),
      ),
    );
    render(<LocalAccessNotice />);
    fireEvent.click(await screen.findByTestId('local-access-notice-allow'));
    await waitFor(() => expect(screen.getByTestId('modal')).toHaveAttribute('open'));
    const gate = screen.getByTestId('local-access-gate');
    expect(gate).toHaveAttribute('data-mode', 'access');
    expect(gate).toHaveAttribute('data-phase', 'checking');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(daemon.refresh).not.toHaveBeenCalled();
    act(() => allowInBrowser());
    await waitFor(() => expect(daemon.refresh).toHaveBeenCalledTimes(1));
    /* Granted: the banner (and its dialog) are gone. */
    await waitFor(() => expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument());
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('on denied the dialog shows the same steps as the download gate with Recheck, never a Download anyway, and follows the site settings on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const status = fakeStatus('denied');
    vi.stubGlobal('navigator', { userAgent: CHROME_UA, permissions: { query: vi.fn(async () => status) } });
    render(<LocalAccessNotice />);
    fireEvent.click(await screen.findByTestId('local-access-notice-allow'));
    await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'denied'));
    expect(screen.getByTestId('local-access-steps').querySelectorAll(':scope > li')).toHaveLength(3);
    expect(screen.getByTestId('local-access-denied')).toHaveTextContent('Apps on device');
    const recheck = screen.getByTestId('local-access-allow');
    expect(recheck).toHaveTextContent('Recheck');
    fireEvent.click(recheck);
    await waitFor(() => expect(screen.getByTestId('local-access-gate')).toHaveAttribute('data-phase', 'denied'));
    expect(screen.queryByTestId('local-access-bypass')).not.toBeInTheDocument();
    expect(daemon.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('local-access-notice')).toBeInTheDocument();

    /* The user switches the row on in the site settings: the banner and its dialog clear themselves and the agent poll refreshes. */
    act(() => status.set('granted'));
    await waitFor(() => expect(screen.queryByTestId('local-access-notice')).not.toBeInTheDocument());
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    await waitFor(() => expect(daemon.refresh).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ALLOWED_NOTICE_MS);
    });
    expect(daemon.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows one banner per page: the page-top instance, whatever mounted first', async () => {
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => fakeStatus('prompt')) } });
    render(
      <div>
        <div data-testid="page-top">
          <LocalAccessNotice priority={1} />
        </div>
        <div data-testid="control-a">
          <LocalAccessNotice />
        </div>
        <div data-testid="control-b">
          <LocalAccessNotice />
        </div>
      </div>,
    );
    await waitFor(() => expect(screen.getAllByTestId('local-access-notice')).toHaveLength(1));
    expect(screen.getByTestId('page-top')).toContainElement(screen.getByTestId('local-access-notice'));
  });
});
