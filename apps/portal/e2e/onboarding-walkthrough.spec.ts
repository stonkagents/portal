/**
 * Story: Home two-step flow
 * Purpose: Visual E2E walkthrough of the home page as a two-step product:
 *   Step 1 Launchpad (connect wallet, open the launch form) →
 *   Step 2 Run your agent (token card on top, the one install flow in its
 *   Install → Permissions → Live frame, mock daemon) →
 *   done (connected home with the tracker-backed token card).
 *
 * The launch itself needs a wallet and a chain, so Step 2 is entered the way a
 * returning creator enters it: the per-wallet launch record in localStorage.
 *
 * Run with:
 *   npx playwright test onboarding-walkthrough --headed --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

/* How long to pause between steps so the watcher can see each state */
const STEP_PAUSE = 1800;

/* Mock wallet address (src/lib/wallet/mock-wallet.ts) and the per-wallet launch key */
const MOCK_WALLET = '7a3bK9rNqP2xM5vT8wDf6jHk4nLs1gYc9f2cRtEm';
const LAUNCH_KEY = `stonkagents:launch:${MOCK_WALLET}`;
const MINT = 'MinT1111111111111111111111111111111111111111';

async function dismissSplash(page: Page) {
  const splash = page.getByTestId('splash-screen');
  try {
    await splash.waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByTestId('splash-fix-btn').click();
    await splash.waitFor({ state: 'detached', timeout: 10_000 });
    await page.waitForTimeout(STEP_PAUSE);
  } catch {
    // Splash already dismissed via sessionStorage — continue
  }
}

test.describe('Home two-step walkthrough', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('Step 1 Launchpad → Step 2 Run your agent → connected home', async ({ page }) => {
    /* Extend timeout — this is a visual walkthrough, not a speed test */
    test.setTimeout(180_000);

    /* ──────────────────────────────────────────────
       Step 1 — Launchpad
       ────────────────────────────────────────────── */
    await test.step('Navigate to home page', async () => {
      await page.goto('/');
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Dismiss splash screen (if visible)', async () => {
      await dismissSplash(page);
    });

    await test.step('Home lands in the launch phase', async () => {
      await expect(page.getByTestId('home-page')).toBeVisible();
      await expect(page.getByTestId('hero-launchpad')).toBeVisible();
      await expect(page.getByRole('heading', { name: /Launch your StonkAgent/ })).toBeVisible();
      await expect(page.getByTestId('step-bullets')).toHaveAttribute('data-active', '1');
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Launch is always tappable; the wallet comes first', async () => {
      await expect(page.getByTestId('launchpad-open-form')).toBeEnabled();
      await expect(page.getByTestId('launchpad-wallet-hint')).toBeVisible();
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Connect the (mock) wallet', async () => {
      await page.getByTestId('launchpad-connect-wallet').click();
      await expect(page.getByTestId('launchpad-wallet-connected')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId('launchpad-open-form')).toBeEnabled();
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Open the launch form', async () => {
      await page.getByTestId('launchpad-open-form').click();
      await expect(page.getByTestId('token-wizard')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP_PAUSE * 1.5);
    });

    await test.step('Close the launch form without launching', async () => {
      await page.keyboard.press('Escape');
      const close = page.getByTestId('tw-close');
      if (await close.isVisible().catch(() => false)) {
        await close.click();
      }
      await page.waitForTimeout(STEP_PAUSE);
      await expect(page.getByTestId('hero-launchpad')).toBeVisible();
    });

    /* ──────────────────────────────────────────────
       Step 2 — Run your agent
       A returning creator: the launch record for this wallet already exists.
       ────────────────────────────────────────────── */
    await test.step('Seed the per-wallet launch record and reload', async () => {
      await page.evaluate(
        ([key, mint]) => {
          localStorage.setItem(
            key,
            JSON.stringify({
              mint,
              name: 'Walkthrough Agent',
              symbol: 'WALK',
              quoteSymbol: 'STONK',
              launchedAt: new Date().toISOString(),
            }),
          );
        },
        [LAUNCH_KEY, MINT],
      );
      await page.reload();
      await dismissSplash(page);
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Reconnect the wallet to pick the launch up', async () => {
      /* The mock wallet does not persist across reloads */
      const connect = page.getByTestId('launchpad-connect-wallet');
      if (await connect.isVisible()) {
        await connect.click();
      }
      await expect(page.getByTestId('hero-agent-step')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Step bullets move to Run your agent', async () => {
      await expect(page.getByTestId('step-bullets')).toHaveAttribute('data-active', '2');
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Token card sits on top of the install flow', async () => {
      await expect(page.getByTestId('agent-step-headline')).toContainText('$WALK');
      await expect(page.getByTestId('token-performance-card')).toBeVisible();
      await expect(page.getByTestId('perf-quote')).toContainText('STONK');
      await expect(page.getByTestId('perf-details')).toHaveAttribute('href', `/tokens/${MINT}`);
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('The one Run your Agent flow sits at Install; the prototype section is gone', async () => {
      const flow = page.getByTestId('run-agent-flow');
      await expect(flow).toBeVisible();
      await expect(flow).toHaveAttribute('data-stage', 'install');
      await expect(page.getByTestId('run-agent-step-install')).toHaveAttribute('data-state', 'current');
      /* Windows: the manifest-backed download (or its honest unavailable state). Elsewhere: coming soon. */
      const install = page
        .getByTestId('download-installer')
        .or(page.getByTestId('download-unavailable'))
        .or(page.getByTestId('download-pending'))
        .or(page.getByTestId('install-coming-soon'));
      await expect(install.first()).toBeVisible();
      await expect(page.getByText('npm install stonkagents')).toHaveCount(0);
      await expect(page.getByText('Docker')).toHaveCount(0);
      await page.waitForTimeout(STEP_PAUSE);
    });

    /* ──────────────────────────────────────────────
       Done — the agent comes online (mock daemon on :7841)
       ────────────────────────────────────────────── */
    await test.step('Daemon detected → connected home', async () => {
      const connectedHome = page.getByTestId('connected-home');
      try {
        await expect(connectedHome).toBeVisible({ timeout: 20_000 });
      } catch {
        test.skip(true, 'No daemon on localhost:7841 — start the mock daemon to watch Step 2 complete');
      }
      await expect(page.getByTestId('token-launched-card')).toBeVisible();
      await expect(page.getByTestId('token-performance-card')).toBeVisible();
      await expect(page.getByTestId('run-agent-flow')).toHaveCount(0);
      await page.waitForTimeout(STEP_PAUSE * 1.5);
    });

    await test.step('Founding Agent badge and celebration', async () => {
      await expect(page.locator('text=Founding Agent').first()).toBeVisible();
      await page.waitForTimeout(STEP_PAUSE);
    });

    /* ──────────────────────────────────────────────
       Landing sections below stay in order
       ────────────────────────────────────────────── */
    await test.step('Scroll to Deep Dive tabs', async () => {
      await page.locator('#deep-dive').scrollIntoViewIfNeeded();
      await page.waitForTimeout(STEP_PAUSE);
    });

    await test.step('Click through Deep Dive tabs', async () => {
      for (const tab of ['What Agents Share', 'How It Works', 'Reputation & Trust', 'Built Different']) {
        await page.getByRole('button', { name: tab }).click();
        await page.waitForTimeout(STEP_PAUSE);
      }
    });

    await test.step('Scroll to Platforms, dictionary and the final CTA', async () => {
      await page.locator('#platforms').scrollIntoViewIfNeeded();
      await page.waitForTimeout(STEP_PAUSE);
      await page.locator('#dict').scrollIntoViewIfNeeded();
      await page.waitForTimeout(STEP_PAUSE);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(STEP_PAUSE * 2);
    });
  });
});
