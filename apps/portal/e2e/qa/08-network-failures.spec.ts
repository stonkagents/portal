/**
 * QA area 8: every network failure mode, each through Playwright route interception:
 * the tracker down (refused), rate limiting (429), the Solana RPC down, Jupiter down, Pinata
 * down, and the agent dying mid-request. Every page must name what failed and offer a way
 * back (a Retry, or a poll that recovers), never a blank screen, a raw "Failed to fetch",
 * or a spinner without a cap.
 *
 * Needs the QA daemon and portal (e2e/qa/README.md).
 */
import type { Page } from '@playwright/test';
import { test, expect, seedVisitor, waitForConnected, QA_DAEMON_URL, QA_TRACKER_URL } from './fixtures';

const TRACKER = `${QA_TRACKER_URL}/**`;
const RPC = /solana\.com|alchemy\.com/;
const JUPITER = /jup\.ag/;
const PINATA = /pinata\.cloud|ipfs\.io/;
const AGENT_MINT = 'CuiXbpnJWrqNrhLswZeayAKPHrhcZwkZS8ZKYcJGvp3Y';

/** No raw transport error ever reaches the page, and nothing spins without an end. */
async function expectNamedFailuresOnly(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/Failed to fetch|TypeError|NetworkError|\[object Object\]/);
  expect(text.length).toBeGreaterThan(400);
  await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 45_000 });
}

test.describe('Tracker unreachable', () => {
  test('the home names the launchpad and the ledger, keeps the rest, and recovers on its own', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(TRACKER, route => route.abort('connectionrefused'));
    await page.goto('/');
    await waitForConnected(page);
    await expect(page.getByTestId('trending-unreachable')).toContainText("Can't reach the launchpad", { timeout: 30_000 });
    await expect(page.getByTestId('featured-ledger-error')).toContainText('the tracker could not be reached', { timeout: 30_000 });
    await expectNamedFailuresOnly(page);
    /* Back up: the polls pick the launchpad up again without a reload. */
    await page.unroute(TRACKER);
    await expect(page.getByTestId('trending-grid')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('trending-unreachable')).toHaveCount(0);
  });

  test('the token list says so and Retry now brings it back', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(TRACKER, route => route.abort('connectionrefused'));
    await page.goto('/tokens/');
    await waitForConnected(page);
    await expect(page.getByTestId('tokens-empty-reason')).toContainText("Can't reach the launchpad", { timeout: 60_000 });
    await expectNamedFailuresOnly(page);
    await page.unroute(TRACKER);
    await page.getByTestId('tokens-empty-retry').click();
    await expect(page.locator('a[data-testid^="token-"][href^="/tokens/"]').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('tokens-empty')).toHaveCount(0);
  });

  test('the community page names the stats, the top agents and the board; the gallery names the packs', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(TRACKER, route => route.abort('connectionrefused'));
    /* The board reads through the agent, whose proxy answers 502 when the tracker is gone. */
    await page.route(/\/api\/v1\/portal\/board\/posts\?/, route =>
      route.fulfill({ status: 502, json: { error: { code: 'PORTAL_PROXY_UNAVAILABLE', message: 'tracker unreachable' } } }),
    );
    await page.goto('/community/');
    await waitForConnected(page);
    await expect(page.getByTestId('network-stats-failed')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('top-agents-failed')).toBeVisible({ timeout: 60_000 });
    const board = page.getByTestId('board-unavailable');
    await expect(board).toContainText("Couldn't load the board.", { timeout: 60_000 });
    await expect(page.getByTestId('board-retry')).toBeVisible();
    await expectNamedFailuresOnly(page);

    await page.goto('/gallery/');
    await waitForConnected(page);
    await expect(page.getByTestId('packs-error')).toContainText('could not be loaded', { timeout: 60_000 });
    await expectNamedFailuresOnly(page);
  });

  test('rate limited without an agent: the board says slow down and offers Retry', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(`${QA_DAEMON_URL}/**`, route => route.abort('connectionrefused'));
    await page.route(/\/api\/board\/posts\?/, route =>
      route.fulfill({ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }),
    );
    await page.goto('/community/');
    const board = page.getByTestId('board-unavailable');
    await expect(board).toContainText('Slow down', { timeout: 60_000 });
    await page.unroute(/\/api\/board\/posts\?/);
    await page.getByTestId('board-retry').click();
    await expect(page.locator('div[role="button"][data-testid^="post-"]').first()).toBeVisible({ timeout: 60_000 });
  });
});

test.describe('Solana RPC unreachable', () => {
  test('a token page names the RPC and keeps the tracker data; the home token card says the same', async ({ page, context }) => {
    test.setTimeout(150_000);
    await seedVisitor(context);
    await page.route(RPC, route => route.abort('connectionrefused'));
    await page.goto(`/tokens/${AGENT_MINT}/`);
    await waitForConnected(page);
    const poolError = page.getByTestId('agent-pool-error');
    await expect(poolError).toContainText('the Solana RPC could not be reached', { timeout: 90_000 });
    await expect(page.getByTestId('token-detail-header')).toBeVisible();
    await expectNamedFailuresOnly(page);

    await page.goto('/');
    await waitForConnected(page);
    await expect(page.getByTestId('featured-pool-error')).toContainText('the Solana RPC could not be reached', { timeout: 90_000 });
    await expect(page.getByTestId('featured-pool-error')).not.toContainText('Failed to fetch');
  });
});

test.describe('Jupiter unreachable', () => {
  test('the SOL price feed failing falls back silently: prices still render, nothing names a fetch error', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(JUPITER, route => route.abort('connectionrefused'));
    /* On devnet Jupiter is the SOL price feed; the in-app swap and the top-up are mainnet only and unit tested. */
    await page.goto(`/tokens/${AGENT_MINT}/`);
    await waitForConnected(page);
    await expect(page.getByTestId('token-detail-header')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('token-detail-header')).toContainText(/SOL/);
    await expectNamedFailuresOnly(page);
    await page.goto('/');
    await waitForConnected(page);
    await expect(page.getByTestId('featured-agent-card')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('trending-grid').or(page.getByTestId('trending-unreachable'))).toBeVisible({ timeout: 60_000 });
    await expectNamedFailuresOnly(page);
  });
});

test.describe('Pinata unreachable', () => {
  test('token images failing to load leave the cards and the token page readable', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(PINATA, route => route.abort('connectionrefused'));
    await page.goto('/tokens/');
    await waitForConnected(page);
    const first = page.locator('a[data-testid^="token-"][href^="/tokens/"]').first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await expect(first).toContainText(/STONK/);
    await first.click();
    await expect(page.getByTestId('token-detail-header')).toBeVisible({ timeout: 60_000 });
    await expectNamedFailuresOnly(page);
  });
});

test.describe('The agent dying mid-request', () => {
  test('the transfers page falls back to its offline notice and recovers; settings say the agent is needed', async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await seedVisitor(context);
    await page.goto('/transfers/');
    await waitForConnected(page);
    await expect(page.getByTestId('transfer-stats')).toBeVisible({ timeout: 30_000 });
    await page.route(`${QA_DAEMON_URL}/**`, route => route.abort('connectionrefused'));
    await expect(page.getByTestId('agent-offline-notice')).toBeVisible({ timeout: 60_000 });
    await expectNamedFailuresOnly(page);

    await page.goto('/settings/#identity');
    await expect(page.getByTestId('settings-display-name-agent-required')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('settings-display-name')).toBeDisabled();

    await page.unroute(`${QA_DAEMON_URL}/**`);
    await waitForConnected(page, 90_000);
    await expect(page.getByTestId('settings-display-name')).toBeEnabled({ timeout: 30_000 });
  });

  test('a proxy request the agent never answers ends with a deadline, not a spinner', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await page.route(/\/api\/v1\/portal\/board\/posts\?/, () => new Promise<void>(() => {}));
    await page.goto('/community/');
    await waitForConnected(page);
    const board = page.getByTestId('board-unavailable');
    await expect(board).toContainText('did not answer in time', { timeout: 90_000 });
    await expect(page.getByTestId('board-retry')).toBeVisible();
    await expect(page.getByTestId('board-loading')).toHaveCount(0);
  });
});
