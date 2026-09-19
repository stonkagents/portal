/**
 * Purpose: Comprehensive E2E — walks every navigation path, interactive element,
 *   search, filter, modal, and dropdown across the entire app. Works with or
 *   without the mock daemon running (gracefully skips daemon-dependent elements).
 *
 * Run with:
 *   npx playwright test comprehensive-nav --headed --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const STEP = 1200; // pause between steps so watcher can follow

/** Helper: check if an element is visible, never throws */
async function _visible(page: Page, testId: string): Promise<boolean> {
  return page
    .getByTestId(testId)
    .isVisible()
    .catch(() => false);
}

test.describe('Comprehensive Navigation & Interaction Audit', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('Desktop: Full navigation audit', async ({ page }) => {
    test.setTimeout(300_000);

    /* Track whether daemon/connected features are available */
    let isConnected = false;

    /* ────────────────────────────────────────────
       1. HOME PAGE LOAD
       ──────────────────────────────────────────── */
    await test.step('Load home page', async () => {
      /* Pre-set sessionStorage to bypass splash screen (avoids framer-motion timing issues) */
      await page.addInitScript(() => {
        sessionStorage.setItem('stonkagents-splash-seen', '1');
      });
      await page.goto('/');
      await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    /* ────────────────────────────────────────────
       2. NAVBAR ELEMENTS
       ──────────────────────────────────────────── */
    await test.step('Verify navbar visible', async () => {
      await expect(page.getByTestId('navbar')).toBeVisible();
      /* Check connection state — allow time for daemon detection */
      await page.waitForTimeout(3000);
      isConnected = await page
        .getByTestId('avatar-trigger')
        .isVisible()
        .catch(() => false);
      console.log(`[STATE] Connected: ${isConnected}`);
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Navbar right-side controls (if connected)', async () => {
      if (isConnected) {
        const daemon = await page
          .getByTestId('daemon-dot')
          .isVisible()
          .catch(() => false);
        const credit = await page
          .getByTestId('credit-balance')
          .isVisible()
          .catch(() => false);
        const kill = await page
          .getByTestId('kill-switch')
          .isVisible()
          .catch(() => false);
        const bell = await page
          .getByTestId('notification-bell')
          .isVisible()
          .catch(() => false);
        const avatar = await page
          .getByTestId('avatar-trigger')
          .isVisible()
          .catch(() => false);
        console.log(`[NAV] daemon=${daemon} credit=${credit} kill=${kill} bell=${bell} avatar=${avatar}`);
      } else {
        console.log('[NAV] Disconnected — right-side controls hidden (daemon not running)');
        /* When disconnected, navbar shows a "Join" CTA button instead */
        const joinBtn = page.locator('nav').getByRole('link', { name: /join/i });
        if (await joinBtn.isVisible().catch(() => false)) {
          console.log('[NAV] Join CTA button visible');
        }
      }
      await page.waitForTimeout(STEP);
    });

    /* ────────────────────────────────────────────
       3. AVATAR DROPDOWN (if connected)
       ──────────────────────────────────────────── */
    if (isConnected) {
      await test.step('Open avatar dropdown', async () => {
        await page.getByTestId('avatar-trigger').click();
        await expect(page.getByTestId('avatar-dropdown')).toBeVisible();
        await page.waitForTimeout(STEP);
      });

      await test.step('Avatar: Copy Agent ID', async () => {
        await page.getByTestId('avatar-copy-id').click();
        await page.waitForTimeout(800);
      });

      await test.step('Avatar: Verify nav items', async () => {
        await expect(page.getByTestId('avatar-profile')).toBeVisible();
        await expect(page.getByTestId('avatar-settings')).toBeVisible();
        await expect(page.getByTestId('avatar-credits')).toBeVisible();
        await page.waitForTimeout(STEP / 2);
      });

      await test.step('Avatar: Language toggle EN → ZH → EN', async () => {
        await page.getByTestId('avatar-lang-zh').click();
        await page.waitForTimeout(600);
        await page.getByTestId('avatar-lang-en').click();
        await page.waitForTimeout(600);
      });

      await test.step('Avatar: External links', async () => {
        await expect(page.getByTestId('avatar-docs')).toBeVisible();
        await expect(page.getByTestId('avatar-github')).toBeVisible();
        await page.waitForTimeout(STEP / 2);
      });

      await test.step('Avatar: Safe mode toggle', async () => {
        await page.getByTestId('avatar-safe-mode').click();
        await page.waitForTimeout(800);
        const banner = page.getByTestId('kill-banner');
        if (await banner.isVisible().catch(() => false)) {
          await page.waitForTimeout(STEP);
          const resumeBtn = page.getByTestId('kill-banner-resume');
          if (await resumeBtn.isVisible().catch(() => false)) {
            await resumeBtn.click();
            await page.waitForTimeout(600);
          }
        }
      });

      await test.step('Avatar: Disconnect visible → close dropdown', async () => {
        const dd = page.getByTestId('avatar-dropdown');
        if (!(await dd.isVisible().catch(() => false))) {
          await page.getByTestId('avatar-trigger').click();
          await page.waitForTimeout(400);
        }
        await expect(page.getByTestId('avatar-disconnect')).toBeVisible();
        await page.click('body', { position: { x: 100, y: 100 } });
        await page.waitForTimeout(STEP / 2);
      });

      await test.step('Notification panel', async () => {
        await page.getByTestId('notification-bell').click();
        const panel = page.getByTestId('notification-panel');
        if (await panel.isVisible().catch(() => false)) {
          await page.waitForTimeout(STEP);
          const markAll = page.getByTestId('notification-mark-all');
          if (await markAll.isVisible().catch(() => false)) {
            await markAll.click();
            await page.waitForTimeout(600);
          }
          const closeBtn = page.getByTestId('notification-close');
          if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click();
          } else {
            await page.click('body', { position: { x: 100, y: 100 } });
          }
        }
        await page.waitForTimeout(STEP / 2);
      });

      await test.step('Credit balance dropdown', async () => {
        await page.getByTestId('credit-balance').click();
        await page.waitForTimeout(STEP);
        await page.click('body', { position: { x: 100, y: 100 } });
        await page.waitForTimeout(STEP / 2);
      });
    }

    /* ────────────────────────────────────────────
       4. DESKTOP NAV → GALLERY (Knowledge Hub)
       ──────────────────────────────────────────── */
    await test.step('Navigate to Gallery', async () => {
      await page.goto('/gallery');
      await expect(page.getByTestId('gallery-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Gallery: Verify stats bar', async () => {
      const stats = page.getByTestId('gallery-stats');
      if (await stats.isVisible().catch(() => false)) {
        await page.waitForTimeout(STEP / 2);
      }
    });

    await test.step('Gallery: Network map', async () => {
      const map = page.getByTestId('network-map');
      if (await map.isVisible().catch(() => false)) {
        await map.scrollIntoViewIfNeeded();
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Gallery: Curated packs', async () => {
      const packs = page.getByTestId('curated-packs');
      if (await packs.isVisible().catch(() => false)) {
        await packs.scrollIntoViewIfNeeded();
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Gallery: Filter chips', async () => {
      const filters = page.getByTestId('gallery-filters');
      if (await filters.isVisible().catch(() => false)) {
        const chips = filters.locator("[data-testid*='filter-chip']");
        const count = await chips.count();
        for (let i = 0; i < Math.min(count, 4); i++) {
          await chips.nth(i).click();
          await page.waitForTimeout(400);
        }
      }
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Gallery: Sidebar elements', async () => {
      for (const tid of ['your-agent-card', 'transfer-summary', 'quick-actions']) {
        const el = page.getByTestId(tid);
        if (await el.isVisible().catch(() => false)) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(STEP / 2);
        }
      }
    });

    /* ────────────────────────────────────────────
       5. TRANSFERS
       ──────────────────────────────────────────── */
    await test.step('Navigate to Transfers', async () => {
      await page.goto('/transfers');
      await expect(page.getByTestId('transfers-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Transfers: Stats bar', async () => {
      const stats = page.getByTestId('transfer-stats');
      if (await stats.isVisible().catch(() => false)) {
        await page.waitForTimeout(STEP / 2);
      }
    });

    await test.step('Transfers: Click through tabs', async () => {
      const tabLabels = ['Installing', 'Sharing', 'Seeding', 'Completed', 'Failed', 'Library', 'History'];
      for (const label of tabLabels) {
        const tab = page.getByRole('tab', { name: label });
        if (await tab.isVisible().catch(() => false)) {
          await tab.click();
          await page.waitForTimeout(500);
        }
      }
      /* Return to All */
      const allTab = page.getByRole('tab', { name: 'All' });
      if (await allTab.isVisible().catch(() => false)) {
        await allTab.click();
      }
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Transfers: Bulk action buttons', async () => {
      for (const tid of ['pause-all', 'resume-all', 'clear-completed']) {
        const btn = page.getByTestId(tid);
        if (await btn.isVisible().catch(() => false)) {
          console.log(`[TRANSFERS] ${tid} visible`);
        }
      }
      await page.waitForTimeout(STEP / 2);
    });

    /* ────────────────────────────────────────────
       6. PEERS (Agents)
       ──────────────────────────────────────────── */
    await test.step('Navigate to Peers', async () => {
      await page.goto('/peers');
      await expect(page.getByTestId('peers-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Peers: Node hero card', async () => {
      const hero = page.getByTestId('node-hero');
      if (await hero.isVisible().catch(() => false)) {
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Peers: My Agents tab — peer cards', async () => {
      const peerCards = page.locator("[data-testid^='peer-card-']");
      const count = await peerCards.count();
      console.log(`[PEERS] Peer cards found: ${count}`);
      if (count > 0) {
        await peerCards.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(STEP);
        /* Click first card to open profile panel */
        await peerCards.first().click();
        await page.waitForTimeout(STEP);
        const profilePanel = page.getByTestId('agent-profile-panel');
        if (await profilePanel.isVisible().catch(() => false)) {
          console.log('[PEERS] Profile panel opened');
          await page.waitForTimeout(STEP);
          const closePanel = page.getByTestId('agent-profile-close');
          if (await closePanel.isVisible().catch(() => false)) {
            await closePanel.click();
            await page.waitForTimeout(400);
          }
        }
      }
    });

    await test.step('Peers: Switch to Network tab', async () => {
      const networkTab = page.getByRole('tab', { name: /network/i });
      if (await networkTab.isVisible().catch(() => false)) {
        await networkTab.click();
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Peers: Network search', async () => {
      const search = page.getByTestId('network-search');
      if (await search.isVisible().catch(() => false)) {
        await search.scrollIntoViewIfNeeded();
        await search.fill('test_agent');
        await page.waitForTimeout(800);
        await search.clear();
        await page.waitForTimeout(400);
      }
    });

    await test.step('Peers: Sort dropdown', async () => {
      const sort = page.getByTestId('network-sort');
      if (await sort.isVisible().catch(() => false)) {
        await sort.click();
        await page.waitForTimeout(600);
        await page.click('body', { position: { x: 100, y: 100 } });
      }
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Peers: Pagination', async () => {
      const nextBtn = page.getByTestId('pagination-next');
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.scrollIntoViewIfNeeded();
        await nextBtn.click();
        await page.waitForTimeout(800);
        const prevBtn = page.getByTestId('pagination-prev');
        if (await prevBtn.isVisible().catch(() => false)) {
          await prevBtn.click();
          await page.waitForTimeout(600);
        }
      }
    });

    /* ────────────────────────────────────────────
       7. AGENT TOKENS
       ──────────────────────────────────────────── */
    await test.step('Navigate to Agent Tokens', async () => {
      await page.goto('/tokens');
      await expect(page.getByTestId('tokens-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Agent Tokens: Featured tokens', async () => {
      const featured = page.locator("[data-testid^='featured-']");
      const count = await featured.count();
      console.log(`[TOKENS] Featured tokens: ${count}`);
      await page.waitForTimeout(STEP);
    });

    await test.step('Agent Tokens: Token grid', async () => {
      const grid = page.getByTestId('token-grid');
      if (await grid.isVisible().catch(() => false)) {
        await grid.scrollIntoViewIfNeeded();
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Agent Tokens: Filter chips', async () => {
      const chips = page.locator("[data-testid='tokens-page'] [data-testid*='filter-chip']");
      const count = await chips.count();
      for (let i = 0; i < Math.min(count, 4); i++) {
        await chips.nth(i).click();
        await page.waitForTimeout(400);
      }
      /* Reset */
      const reset = page.getByTestId('tokens-reset-filters');
      if (await reset.isVisible().catch(() => false)) {
        await reset.click();
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Agent Tokens: Sort dropdown', async () => {
      const sort = page.getByTestId('tokens-sort');
      if (await sort.isVisible().catch(() => false)) {
        await sort.click();
        await page.waitForTimeout(600);
        await page.click('body', { position: { x: 100, y: 100 } });
      }
    });

    await test.step('Agent Tokens: Token reactions', async () => {
      const fireBtn = page.locator("[data-testid$='-fire']").first();
      if (await fireBtn.isVisible().catch(() => false)) {
        await fireBtn.scrollIntoViewIfNeeded();
        await fireBtn.click();
        await page.waitForTimeout(600);
      }
      const rocketBtn = page.locator("[data-testid$='-rocket']").first();
      if (await rocketBtn.isVisible().catch(() => false)) {
        await rocketBtn.click();
        await page.waitForTimeout(600);
      }
      const crabBtn = page.locator("[data-testid$='-crab']").first();
      if (await crabBtn.isVisible().catch(() => false)) {
        await crabBtn.click();
        await page.waitForTimeout(600);
      }
    });

    /* ────────────────────────────────────────────
       8. COMMUNITY
       ──────────────────────────────────────────── */
    await test.step('Navigate to Community', async () => {
      await page.goto('/community');
      await expect(page.getByTestId('community-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Community: Tab navigation', async () => {
      for (const tab of ['Top', 'Most Discussed', 'Data Requests', 'Discoveries']) {
        const tabBtn = page.getByRole('tab', { name: tab });
        if (await tabBtn.isVisible().catch(() => false)) {
          await tabBtn.click();
          await page.waitForTimeout(600);
        }
      }
      /* Return to Recent */
      const recentTab = page.getByRole('tab', { name: 'Recent' });
      if (await recentTab.isVisible().catch(() => false)) {
        await recentTab.click();
        await page.waitForTimeout(400);
      }
    });

    await test.step('Community: Category filter chips', async () => {
      const chips = page.locator("[data-testid='community-page'] [data-testid*='filter-chip']");
      const count = await chips.count();
      for (let i = 0; i < Math.min(count, 5); i++) {
        await chips.nth(i).click();
        await page.waitForTimeout(400);
      }
    });

    await test.step('Community: Compose post area', async () => {
      const textarea = page.getByTestId('compose-textarea');
      if (await textarea.isVisible().catch(() => false)) {
        await textarea.scrollIntoViewIfNeeded();
        await textarea.fill('Testing compose area — E2E walkthrough');
        await page.waitForTimeout(800);
        const preview = page.getByTestId('draft-preview');
        if (await preview.isVisible().catch(() => false)) {
          await page.waitForTimeout(STEP / 2);
        }
        await textarea.clear();
        await page.waitForTimeout(400);
      }
    });

    await test.step('Community: Sidebar widgets', async () => {
      for (const tid of ['top-agents', 'network-stats-widget', 'board-rules']) {
        const el = page.getByTestId(tid);
        if (await el.isVisible().catch(() => false)) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(STEP / 2);
        }
      }
    });

    await test.step('Community: Open a post thread', async () => {
      const firstPost = page.locator("[data-testid^='post-']").first();
      if (await firstPost.isVisible().catch(() => false)) {
        await firstPost.click();
        await page.waitForTimeout(STEP);
        const threadPanel = page.getByTestId('thread-panel');
        if (await threadPanel.isVisible().catch(() => false)) {
          await page.waitForTimeout(STEP);
          const closeThread = page.getByTestId('thread-close');
          if (await closeThread.isVisible().catch(() => false)) {
            await closeThread.click();
            await page.waitForTimeout(400);
          }
        }
      }
    });

    /* ────────────────────────────────────────────
       9. AGENT CHAT
       ──────────────────────────────────────────── */
    await test.step('Navigate to Agent Chat', async () => {
      await page.goto('/chat');
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Chat: Status bar', async () => {
      const status = page.getByTestId('ac-status-bar');
      if (await status.isVisible().catch(() => false)) {
        console.log('[CHAT] Status bar visible');
      }
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Chat: Type a message', async () => {
      const input = page.getByTestId('agent-chat-input');
      if (await input.isVisible().catch(() => false)) {
        await input.fill('Hello, testing the chat input');
        await page.waitForTimeout(800);
        const sendBtn = page.getByTestId('agent-chat-send');
        console.log(`[CHAT] Send button visible: ${await sendBtn.isVisible().catch(() => false)}`);
        await input.clear();
        await page.waitForTimeout(400);
      }
    });

    await test.step('Chat: Suggestion chips', async () => {
      const suggestions = page.getByTestId('ac-suggestions');
      if (await suggestions.isVisible().catch(() => false)) {
        const chips = suggestions.locator("[data-testid^='ac-suggestion-']");
        const count = await chips.count();
        console.log(`[CHAT] Suggestion chips: ${count}`);
        if (count > 0) {
          await chips.first().click();
          await page.waitForTimeout(STEP);
        }
      }
    });

    /* ────────────────────────────────────────────
       10. PROFILE
       ──────────────────────────────────────────── */
    await test.step('Navigate to Profile', async () => {
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Profile: Sections scroll-through', async () => {
      for (const tid of [
        'profile-hero',
        'profile-stats',
        'profile-eigentrust',
        'profile-token',
        'profile-badges',
        'profile-drops-list',
        'profile-activity-feed',
      ]) {
        const el = page.getByTestId(tid);
        if (await el.isVisible().catch(() => false)) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(STEP / 2);
        }
      }
    });

    await test.step('Profile: Copy Agent ID', async () => {
      const copyId = page.getByTestId('profile-copy-id');
      if (await copyId.isVisible().catch(() => false)) {
        await copyId.scrollIntoViewIfNeeded();
        await copyId.click();
        await page.waitForTimeout(600);
      }
    });

    /* ────────────────────────────────────────────
       11. SETTINGS — ALL 6 TABS
       ──────────────────────────────────────────── */
    await test.step('Navigate to Settings', async () => {
      await page.goto('/settings');
      await expect(page.getByTestId('settings-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Settings: Identity tab', async () => {
      const tab = page.getByTestId('settings-tab-identity');
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(STEP);
        for (const tid of ['settings-peerid', 'settings-display-name', 'settings-pubkey']) {
          const el = page.getByTestId(tid);
          if (await el.isVisible().catch(() => false)) {
            await el.scrollIntoViewIfNeeded();
            console.log(`[SETTINGS] ${tid} visible`);
          }
        }
        const copyBtn = page.getByTestId('settings-peerid-copy');
        if (await copyBtn.isVisible().catch(() => false)) {
          await copyBtn.click();
          await page.waitForTimeout(600);
        }
      }
    });

    await test.step('Settings: Credits tab', async () => {
      const tab = page.getByTestId('settings-tab-credits');
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(STEP);
        for (const tid of ['credit-dashboard', 'token-portfolio', 'transaction-log', 'api-key-display']) {
          const el = page.getByTestId(tid);
          if (await el.isVisible().catch(() => false)) {
            await el.scrollIntoViewIfNeeded();
            console.log(`[SETTINGS] ${tid} visible`);
            await page.waitForTimeout(STEP / 3);
          }
        }
        /* Top-up modal */
        const topup = page.getByTestId('credit-topup');
        if (await topup.isVisible().catch(() => false)) {
          await topup.scrollIntoViewIfNeeded();
          await topup.click();
          await page.waitForTimeout(STEP);
          const modal = page.getByTestId('topup-modal');
          if (await modal.isVisible().catch(() => false)) {
            const cancel = page.getByTestId('topup-cancel');
            if (await cancel.isVisible().catch(() => false)) await cancel.click();
            else
              await page
                .getByTestId('modal-close')
                .click()
                .catch(() => {});
            await page.waitForTimeout(400);
          }
        }
        /* API key reveal */
        const reveal = page.getByTestId('api-key-reveal');
        if (await reveal.isVisible().catch(() => false)) {
          await reveal.click();
          await page.waitForTimeout(800);
        }
      }
    });

    await test.step('Settings: Autonomy tab', async () => {
      const tab = page.getByTestId('settings-tab-autonomy');
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(STEP);
        for (const tid of ['kill-switch-activate', 'autonomy-slider', 'autonomy-desc', 'activity-log']) {
          const el = page.getByTestId(tid);
          if (await el.isVisible().catch(() => false)) {
            await el.scrollIntoViewIfNeeded();
            console.log(`[SETTINGS] ${tid} visible`);
          }
        }
      }
    });

    await test.step('Settings: Folders tab', async () => {
      const tab = page.getByTestId('settings-tab-folders');
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(STEP);
        for (const tid of ['settings-upload-dir', 'settings-download-dir', 'settings-data-dir']) {
          const el = page.getByTestId(tid);
          if (await el.isVisible().catch(() => false)) console.log(`[SETTINGS] ${tid} visible`);
        }
      }
    });

    await test.step('Settings: Security tab', async () => {
      const tab = page.getByTestId('settings-tab-security');
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(STEP);
        const slider = page.getByTestId('settings-min-rep-slider');
        if (await slider.isVisible().catch(() => false)) {
          await slider.scrollIntoViewIfNeeded();
          console.log('[SETTINGS] min-rep slider visible');
        }
        const blocklist = page.getByTestId('settings-blocklist');
        if (await blocklist.isVisible().catch(() => false)) {
          await blocklist.scrollIntoViewIfNeeded();
          console.log('[SETTINGS] blocklist visible');
        }
      }
    });

    await test.step('Settings: Account tab (danger zone)', async () => {
      const tab = page.getByTestId('settings-tab-account');
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(STEP);
        const dangerZone = page.getByTestId('danger-zone');
        if (await dangerZone.isVisible().catch(() => false)) {
          await dangerZone.scrollIntoViewIfNeeded();
          await page.waitForTimeout(STEP);
        }
      }
    });

    /* ────────────────────────────────────────────
       12. FOOTER
       ──────────────────────────────────────────── */
    await test.step('Scroll to footer', async () => {
      const footer = page.getByTestId('footer');
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Footer: Platform links', async () => {
      const links = page.getByTestId('footer').locator("a[data-testid^='footer-']");
      const count = await links.count();
      console.log(`[FOOTER] Platform links: ${count}`);
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Footer: Legal accordions', async () => {
      const privacy = page.getByTestId('footer-legal-privacy-policy');
      if (await privacy.isVisible().catch(() => false)) {
        await privacy.click();
        await page.waitForTimeout(800);
        await privacy.click();
        await page.waitForTimeout(400);
      }
      const terms = page.getByTestId('footer-legal-terms-of-service');
      if (await terms.isVisible().catch(() => false)) {
        await terms.click();
        await page.waitForTimeout(800);
        await terms.click();
        await page.waitForTimeout(400);
      }
    });

    await test.step('Footer: Social links', async () => {
      await expect(page.getByTestId('footer-twitter')).toBeVisible();
      await expect(page.getByTestId('footer-website')).toBeVisible();
      await page.waitForTimeout(STEP / 2);
    });

    /* ────────────────────────────────────────────
       13. HOME → Full scroll
       ──────────────────────────────────────────── */
    await test.step('Return to Home', async () => {
      await page.goto('/');
      await expect(page.getByTestId('home-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Home: Scroll all sections', async () => {
      for (const id of ['#deep-dive', '#platforms', '#dict']) {
        const el = page.locator(id);
        if (await el.isVisible().catch(() => false)) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(STEP);
        }
      }
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      await page.waitForTimeout(STEP);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(STEP * 2);
    });
  });

  /* ══════════════════════════════════════════════
     MOBILE NAVIGATION TEST
     ══════════════════════════════════════════════ */
  test('Mobile: Bottom nav + Drawer audit', async ({ page }) => {
    test.setTimeout(180_000);

    await page.setViewportSize({ width: 375, height: 812 });

    await test.step('Load home page (mobile)', async () => {
      await page.addInitScript(() => {
        sessionStorage.setItem('stonkagents-splash-seen', '1');
        // Remove Next.js dev overlay that intercepts pointer events in dev mode
        const observer = new MutationObserver(() => {
          document.querySelectorAll('nextjs-portal').forEach(el => el.remove());
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      });
      await page.goto('/');
      await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    /* ── Remove Next.js dev overlay that intercepts mobile clicks ── */
    await page.evaluate(() => {
      document.querySelectorAll('nextjs-portal').forEach(el => el.remove());
      const s = document.querySelector('script[data-nextjs-dev-overlay]');
      if (s) s.remove();
    });

    /* ── Bottom Nav ── */
    await test.step('Mobile: Bottom nav visible', async () => {
      await expect(page.getByTestId('mobile-bottom-nav')).toBeVisible();
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Mobile: Bottom nav → Knowledge', async () => {
      await page.getByTestId('mobile-nav-knowledge').click({ force: true });
      await expect(page.getByTestId('gallery-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    await test.step('Mobile: Bottom nav → Agents', async () => {
      await page.getByTestId('mobile-nav-agents').click({ force: true });
      await expect(page.getByTestId('tokens-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    await test.step('Mobile: Bottom nav → Community', async () => {
      await page.getByTestId('mobile-nav-community').click({ force: true });
      await expect(page.getByTestId('community-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    await test.step('Mobile: Bottom nav → Chat', async () => {
      await page.getByTestId('mobile-nav-chat').click({ force: true });
      await expect(page.getByTestId('chat-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    await test.step('Mobile: Bottom nav → Home', async () => {
      await page.getByTestId('mobile-nav-home').click({ force: true });
      await expect(page.getByTestId('home-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    /* ── Mobile Drawer ── */
    await test.step('Open drawer', async () => {
      await page.getByTestId('hamburger-button').click({ force: true });
      await expect(page.getByTestId('mobile-drawer')).toBeVisible();
      await page.waitForTimeout(STEP);
    });

    await test.step('Drawer: Verify all section links', async () => {
      for (const tid of [
        'drawer-nav-home',
        'drawer-nav-agents',
        'drawer-nav-knowledge',
        'drawer-nav-chat',
        'drawer-nav-community',
        'drawer-nav-transfers',
        'drawer-nav-network',
      ]) {
        const link = page.getByTestId(tid);
        console.log(`[DRAWER] ${tid}: ${await link.isVisible().catch(() => false)}`);
      }
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Drawer: Language toggle', async () => {
      await page.getByTestId('drawer-lang-zh').click({ force: true });
      await page.waitForTimeout(600);
      await page.getByTestId('drawer-lang-en').click({ force: true });
      await page.waitForTimeout(600);
    });

    await test.step('Drawer: Safe mode & disconnect visible', async () => {
      // Re-open drawer if it closed after locale change
      if (
        !(await page
          .getByTestId('mobile-drawer')
          .isVisible()
          .catch(() => false))
      ) {
        await page.getByTestId('hamburger-button').click({ force: true });
        await expect(page.getByTestId('mobile-drawer')).toBeVisible({ timeout: 5_000 });
      }
      await expect(page.getByTestId('drawer-safe-mode')).toBeVisible();
      // disconnect shown when connected=true (default), spawn when disconnected
      const hasDisconnect = await page
        .getByTestId('drawer-disconnect')
        .isVisible()
        .catch(() => false);
      const hasSpawn = await page
        .getByTestId('drawer-spawn')
        .isVisible()
        .catch(() => false);
      expect(hasDisconnect || hasSpawn).toBeTruthy();
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Drawer: Navigate to Settings', async () => {
      await page.getByTestId('drawer-settings').click({ force: true });
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(STEP);
    });

    await test.step('Drawer: Navigate to Transfers', async () => {
      await page.getByTestId('hamburger-button').click({ force: true });
      await page.waitForTimeout(400);
      const link = page.getByTestId('drawer-nav-transfers');
      if (await link.isVisible().catch(() => false)) {
        await link.click({ force: true });
        await expect(page.getByTestId('transfers-page')).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Drawer: Navigate to Peers', async () => {
      await page.getByTestId('hamburger-button').click({ force: true });
      await page.waitForTimeout(400);
      const link = page.getByTestId('drawer-nav-agents');
      if (await link.isVisible().catch(() => false)) {
        await link.click({ force: true });
        await expect(page.getByTestId('peers-page')).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(STEP);
      }
    });

    await test.step('Drawer: Close via X', async () => {
      await page.getByTestId('hamburger-button').click({ force: true });
      await page.waitForTimeout(400);
      await page.getByTestId('drawer-close').click({ force: true });
      await page.waitForTimeout(STEP / 2);
    });

    await test.step('Mobile: Return to Home', async () => {
      await page.getByTestId('mobile-nav-home').click({ force: true });
      await expect(page.getByTestId('home-page')).toBeVisible();
      await page.waitForTimeout(STEP);
    });
  });
});
