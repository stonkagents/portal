/**
 * Purpose: Debug test — verifies wallet connect + full token launch flow in mock mode
 */
import { test, expect } from '@playwright/test';

test.describe('Token Wizard - Wallet Connect Debug', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('full wizard flow: open → connect → review → launch → success', async ({ page }) => {
    test.setTimeout(60_000);

    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Dismiss splash — wait for it to fully appear first (avoids race with "checking" state)
    const splash = page.getByTestId('splash-screen');
    try {
      await splash.waitFor({ state: 'visible', timeout: 5_000 });
      await page.getByTestId('splash-fix-btn').click();
      // Wait for the 3s countdown + 0.9s dismiss animation + removal from DOM
      await splash.waitFor({ state: 'detached', timeout: 10_000 });
    } catch {
      // Splash may have been dismissed by sessionStorage — continue
    }

    // Wait for connected home (daemon must be running on :7841 with status "ok")
    await expect(page.getByTestId('connected-home')).toBeVisible({ timeout: 20_000 });

    // Open token wizard
    await page.getByTestId('fork-token-launch').click();
    await expect(page.getByTestId('tw-step-1')).toBeVisible({ timeout: 5_000 });

    // Step 1 → Step 2
    await page.getByTestId('tw-next-1').click();
    await expect(page.getByTestId('tw-step-2')).toBeVisible({ timeout: 5_000 });

    // Wallet connect button
    const btn = page.getByTestId('tw-connect-wallet');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    // Click connect
    await btn.click();

    // Wait for wallet connected (mock takes 1.5s)
    await expect(page.getByTestId('tw-wallet-card')).toContainText('Wallet Connected', { timeout: 5_000 });

    // Check Review button enabled
    const next2 = page.getByTestId('tw-next-2');
    await expect(next2).toBeEnabled();

    // Go to review
    await next2.click();
    await expect(page.getByTestId('tw-step-3')).toBeVisible({ timeout: 5_000 });

    // Launch
    await page.getByTestId('tw-launch').click();
    await expect(page.getByTestId('tw-confirming')).toBeVisible({ timeout: 5_000 });

    // Wait for success
    await expect(page.getByTestId('tw-success')).toBeVisible({ timeout: 15_000 });

    // Print all errors
    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));
    }
    expect(errors.filter(e => e.includes('PAGEERROR'))).toHaveLength(0);
  });
});
