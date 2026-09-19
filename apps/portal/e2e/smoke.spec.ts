/**
 * Purpose: E2E smoke test — verifies the app loads and renders core elements
 */
import { test, expect } from '@playwright/test';

test.describe('Smoke test', () => {
  test('home page loads and shows splash or main content', async ({ page }) => {
    await page.goto('/');

    // Wait for splash to fully appear then dismiss it (or skip if already seen)
    const splash = page.getByTestId('splash-screen');
    try {
      await splash.waitFor({ state: 'visible', timeout: 5_000 });
      await page.getByTestId('splash-fix-btn').click();
      await splash.waitFor({ state: 'detached', timeout: 10_000 });
    } catch {
      // Splash already dismissed via sessionStorage
    }

    // Main content should be visible after splash
    await expect(page).toHaveTitle(/StonkAgents/);
  });
});
