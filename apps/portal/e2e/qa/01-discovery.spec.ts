/**
 * QA area 1: first visit and discovery of an installed agent, offline and online
 * transitions, the update banner against the site manifest, the wrong-build notice.
 *
 * Needs a QA daemon and a portal pointed at it (e2e/qa/README.md); skips otherwise.
 * Nothing here needs a controller: the controller routes are mocked or left failing.
 */
import type { Page } from '@playwright/test';
import { test, expect, seedVisitor, dismissSplash, waitForConnected, waitForOffline, QA_DAEMON_URL } from './fixtures';

const CONTROLLER_UPDATE = /\/api\/v1\/controller\/update\/status/;
const STATUS = /\/api\/v1\/status(\?|$)/;

function updateStatus(overrides: Record<string, unknown>) {
  return {
    state: 'IDLE',
    current_version: '2.5.0',
    latest_version: '2.5.0',
    release_notes: '',
    force: false,
    progress: 0,
    bytes_downloaded: 0,
    bytes_total: 0,
    error: null,
    installer_url: null,
    manual_install: false,
    ...overrides,
  };
}

/** Later and Dismiss collapse the banner in place (it stays mounted for the exit transition). */
async function expectBannerCollapsed(page: Page) {
  await expect(page.getByTestId('update-banner').locator('..')).toHaveCSS('opacity', '0');
}

test.describe('Discovery and connection', () => {
  test('a first visit finds the installed agent and records it', async ({ page, context, daemon }) => {
    await seedVisitor(context, { fresh: true });
    await page.goto('/');
    await dismissSplash(page);
    await expect(page.getByTestId('home-page')).toBeVisible();
    /* Discovery: one probe on load, nothing recorded yet. */
    await waitForConnected(page);
    await expect(page.getByTestId('footer-agent-version')).toHaveCount(0); // no controller: no version, no error
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('stonkagents:user') ?? '{}'));
    expect(profile.hasInstalledDaemon).toBe(true);
    expect(daemon.peerId).not.toBe('');
  });

  test('the connected home shows the run-your-agent steps and no error text', async ({ page, context }) => {
    await seedVisitor(context);
    await page.goto('/');
    await waitForConnected(page);
    await expect(page.getByTestId('run-agent-steps')).toBeVisible();
    await expect(page.getByTestId('hero-daemon-crashed')).toHaveCount(0);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test('the agent going away shows the offline hero with Restart, and coming back clears it', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.goto('/');
    await waitForConnected(page);

    /* The daemon vanishes: every loopback call is refused. */
    await page.route(`${QA_DAEMON_URL}/**`, route => route.abort('connectionrefused'));
    await waitForOffline(page, 30_000);
    const crashed = page.getByTestId('hero-daemon-crashed');
    await expect(crashed).toBeVisible({ timeout: 10_000 });
    await expect(crashed).toContainText('went offline');
    await expect(page.getByTestId('hero-daemon-last-seen')).toContainText('Last seen');
    await expect(page.getByTestId('hero-daemon-crashed-hint')).toBeVisible();

    /* Restart with no controller: a bounded run of attempts, cancellable, back to the offline hero. */
    await page.getByTestId('restart-daemon-button').click();
    const reconnecting = page.getByTestId('hero-daemon-reconnecting');
    await expect(reconnecting).toBeVisible();
    await expect(reconnecting).toContainText(/Attempt \d of \d/);
    await page.getByTestId('cancel-reconnect-button').click();
    await expect(crashed).toBeVisible();

    /* The agent is back: the next poll reconnects without a reload. */
    await page.unroute(`${QA_DAEMON_URL}/**`);
    await waitForConnected(page, 90_000);
    await expect(crashed).toHaveCount(0);
    await expect(page.getByTestId('run-agent-steps')).toBeVisible();
  });

  test('a healthy agent of another environment is a wrong build, not an offline agent', async ({ page, context }) => {
    await seedVisitor(context);
    await page.route(STATUS, async route => {
      const res = await route.fetch();
      const json = (await res.json()) as Record<string, unknown>;
      await route.fulfill({
        response: res,
        json: { ...json, tracker_url: 'https://tracker.stg.stonkagents.com', environment: 'stg' },
      });
    });
    await page.goto('/');
    const badge = page.getByTestId('nav-env-mismatch');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toContainText('Wrong agent build');
    await expect(badge).toContainText('Dev build');
    await expect(page.getByTestId('daemon-dot')).toHaveCount(0);
    await expect(page.getByTestId('hero-daemon-crashed')).toHaveCount(0);

    /* The chat page says the same thing instead of "offline", and its panel links this site's installer. */
    await page.goto('/chat/');
    await expect(page.getByTestId('ac-status-text')).toHaveText('Wrong agent build', { timeout: 20_000 });
    await page.getByTestId('chat-daemon-panel-expand').click();
    const notice = page.getByTestId('chat-daemon-panel-env-mismatch');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Staging build');
    await expect(notice).toContainText('This site is Dev');
    const link = notice.getByTestId('agent-env-mismatch-download');
    await expect(link).toHaveAttribute('href', /releases\.dev\./);
  });
});

test.describe('Update banner', () => {
  test('no controller: no banner and no error toast', async ({ page, context }) => {
    await seedVisitor(context);
    await page.goto('/');
    await waitForConnected(page);
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    await expect(page.getByTestId('toast-container').getByText(/controller|unreachable|went wrong/i)).toHaveCount(0);
  });

  test('a manual update offers this site release, and Later puts it away', async ({ page, context }) => {
    await seedVisitor(context);
    await page.route(CONTROLLER_UPDATE, route =>
      route.fulfill({
        json: updateStatus({
          state: 'AVAILABLE',
          latest_version: '9.9.9',
          release_notes: 'StonkAgents 9.9.9: the agent answer, not this site.',
          installer_url: 'https://example.invalid/agent-answer.exe',
          manual_install: true,
        }),
      }),
    );
    await page.goto('/');
    await waitForConnected(page);
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    /* The version, notes and link come from this site's manifest, never from the agent's tracker. */
    await expect(banner).not.toContainText('9.9.9');
    await expect(banner).toContainText(/Update your agent to v\d+\.\d+\.\d+/);
    const link = page.getByTestId('update-download-link');
    await expect(link).toHaveAttribute('href', /releases\.dev\.[a-z.]+\/.+\.exe$/);
    await expect(page.getByTestId('update-manual-hint')).toBeVisible();
    await expect(page.getByTestId('footer-agent-version')).toContainText('agent v2.5.0');
    await page.getByTestId('update-later-button').click();
    await expectBannerCollapsed(page);
  });

  test('download progress, failure with Dismiss, and a forced update without Later', async ({ page, context }) => {
    await seedVisitor(context);
    let state = updateStatus({
      state: 'DOWNLOADING',
      latest_version: '2.6.0',
      progress: 42,
      bytes_downloaded: 21_000_000,
      bytes_total: 50_000_000,
    });
    await page.route(CONTROLLER_UPDATE, route => route.fulfill({ json: state }));
    await page.goto('/');
    await waitForConnected(page);
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText('Downloading... 42%');
    await expect(page.getByTestId('update-progress-bar')).toHaveAttribute('style', /width: 42%/);
    await expect(page.getByTestId('update-cancel-button')).toBeVisible();

    state = updateStatus({ state: 'FAILED', latest_version: '2.6.0', error: 'checksum mismatch' });
    await expect(banner).toContainText('Update failed', { timeout: 20_000 });
    await expect(banner).toContainText('checksum mismatch');
    await page.getByTestId('update-dismiss-button').click();
    await expectBannerCollapsed(page);

    state = updateStatus({
      state: 'AVAILABLE',
      latest_version: '2.7.0',
      force: true,
      installer_url: 'https://example.invalid/x.exe',
      manual_install: true,
    });
    await expect(banner).toContainText('no longer supported', { timeout: 30_000 });
    await expect(banner.locator('..')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('update-later-button')).toHaveCount(0);
  });
});
