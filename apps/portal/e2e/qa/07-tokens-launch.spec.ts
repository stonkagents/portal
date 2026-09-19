/**
 * QA area 7: the token pages and the launch form up to the wallet prompt, with a fake
 * Wallet Standard wallet (fixtures.installFakeWallet) that connects and refuses to sign.
 * Nothing is signed or sent: the devnet drip is intercepted, the metadata upload is
 * intercepted, and the fake wallet answers every signature the way Cancel does.
 *
 * Covers: the token list and a live token page, the launch form's validation, pricing
 * rows, devnet notes, image errors, the upload failing (named and retryable), the wallet
 * declining (named, form kept), and the Allow local access gate in front of the installer.
 *
 * Needs the QA daemon and portal (e2e/qa/README.md).
 */
import type { Page } from '@playwright/test';
import { test, expect, seedVisitor, waitForConnected, installFakeWallet, QA_DAEMON_URL, QA_WALLET_ADDRESS } from './fixtures';

const DRIP = /\/api\/dev\/drip/;
const METADATA = /\/api\/launch\/metadata$/;
const BY_WALLET = /\/api\/launch\/by-wallet\?/;

function pngBuffer(bytes: number) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length), 3)]);
}

/** A real 1x1 PNG, so the artwork studio can decode it. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function connectFakeWallet(page: Page) {
  await page.getByTestId('launchpad-connect-wallet').click();
  /* The connector module loads on demand; on a busy dev server the prompt takes a moment to list wallets. */
  await page.getByTestId('connect-wallet-wallet-standard:qa-wallet').click({ timeout: 60_000 });
  /* A wallet with a launch on record moves the home to Step 2 instead of showing the launchpad. */
  await expect(page.getByTestId('launchpad-wallet-connected').or(page.getByTestId('run-agent-flow')).first()).toBeVisible({
    timeout: 20_000,
  });
}

async function openLaunchForm(page: Page) {
  await page.getByTestId('launchpad-open-form').click();
  await expect(page.getByTestId('launch-form')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('launch-summary')).toBeVisible({ timeout: 30_000 });
}

async function fillIdentity(page: Page, name: string, symbol: string) {
  await page.getByLabel('Agent name').fill(name);
  await page.getByLabel('Symbol').fill(symbol);
  await page.getByTestId('image-input').setInputFiles({ name: 'qa3.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.getByTestId('launch-action')).toBeEnabled({ timeout: 20_000 });
}

test.describe('Token pages', () => {
  test('the token list loads from the tracker and a token page shows its header, stats and tabs', async ({ page, context }) => {
    test.setTimeout(90_000);
    await seedVisitor(context);
    await page.goto('/tokens/');
    await waitForConnected(page);
    const first = page.locator('a[data-testid^="token-"][href^="/tokens/"]').first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();
    /* The dev server compiles the token route on its first visit. */
    await expect(page).toHaveURL(/\/tokens\/[1-9A-HJ-NP-Za-km-z]{32,44}/, { timeout: 60_000 });
    await expect(page.getByTestId('token-detail-header')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('token-detail-stats').first()).toBeVisible();
    await expect(page.getByTestId('token-main-tabs')).toBeVisible();
    await expect(page.getByTestId('token-detail-unavailable')).toHaveCount(0);
    /* Without a wallet the trade panel asks for one instead of failing. */
    await expect(page.getByTestId('trade-connect').or(page.getByTestId('token-trading-external'))).toBeVisible({ timeout: 30_000 });
  });

  test('an unknown mint is a named empty state, not a blank page', async ({ page, context }) => {
    await seedVisitor(context);
    /* The CDN serves the pre-rendered shell for every /tokens/<mint>/ and the page reads the mint off
       the path; the dev server only knows the mints it exported, so the shell is entered by hand here. */
    await page.goto('/tokens/placeholder/');
    await page.evaluate(() => window.history.replaceState(null, '', '/tokens/QA3noSuchMint1111111111111111111111111111111/'));
    await expect(page.getByTestId('token-detail-not-found')).toContainText('Agent not found', { timeout: 60_000 });
    await page.evaluate(() => window.history.replaceState(null, '', '/tokens/0OIl-not-base58/'));
    await expect(page.getByText('Invalid token address.')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Launch form up to the wallet', () => {
  test.beforeEach(async ({ page, context }) => {
    await seedVisitor(context);
    await installFakeWallet(context);
    /* No devnet SOL is moved for the QA wallet. */
    await page.route(DRIP, route => route.fulfill({ json: { data: { ok: true, skipped: true } } }));
  });

  test('pricing rows, the devnet note, validation and the image rules', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await connectFakeWallet(page);
    await openLaunchForm(page);

    /* The summary rows come from the tracker's launch config. */
    for (const row of ['launchpad', 'paired-with', 'graduates-at', 'supply', 'trading-fee', 'transfer-tax-holders', 'launch-cost']) {
      await expect(page.getByTestId(`summary-${row}`)).toBeVisible();
    }
    await expect(page.getByTestId('summary-paired-with')).toContainText('STONK');
    await expect(page.getByTestId('summary-graduates-at')).toContainText(/\d/);
    await expect(page.getByTestId('summary-launch-cost')).toContainText(/SOL/);
    await expect(page.getByTestId('launch-devnet-note')).toContainText(/Devnet/);
    await expect(page.getByTestId('launch-config-error')).toHaveCount(0);

    /* Nothing filled: the button says what is missing and stays disabled. */
    const action = page.getByTestId('launch-action');
    await expect(action).toBeDisabled();
    await expect(page.getByTestId('launch-action-note')).toContainText(/name.*symbol.*image/i);

    /* The symbol is capped at 10 characters and shown upper case. */
    await page.getByLabel('Symbol').fill('toolongsymbolx');
    await expect(page.getByLabel('Symbol')).toHaveValue(/^[A-Z]{10}$/);

    /* Image rules: a GIF and an oversized PNG are refused with a reason; a small PNG is taken. */
    const image = page.getByTestId('image-input');
    await image.setInputFiles({ name: 'anim.gif', mimeType: 'image/gif', buffer: pngBuffer(1024) });
    await expect(page.getByText(/GIFs are not supported/)).toBeVisible();
    await image.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: pngBuffer(2 * 1024 * 1024 + 10) });
    await expect(page.getByText('Keep the image under 2 MB')).toBeVisible();
    await image.setInputFiles({ name: 'qa3.png', mimeType: 'image/png', buffer: TINY_PNG });
    await expect(page.getByText('Keep the image under 2 MB')).toHaveCount(0);

    await page.getByLabel('Agent name').fill('[qa3] never launched');
    await expect(action).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId('launch-action-note').filter({ hasText: /name.*symbol.*image/i })).toHaveCount(0);
  });

  test('the metadata upload failing is named with the launchpad, and the form is kept for a retry', async ({ page }) => {
    test.setTimeout(150_000);
    await page.route(BY_WALLET, route => route.fulfill({ json: { data: [] } }));
    await page.route(METADATA, route =>
      route.fulfill({ status: 503, json: { error: { code: 'PINATA_UNAVAILABLE', message: 'pinning service unavailable' } } }),
    );
    await page.goto('/');
    await connectFakeWallet(page);
    await openLaunchForm(page);
    await fillIdentity(page, '[qa3] upload fails', 'QAUPL');
    await page.getByTestId('launch-action').click();
    const note = page.getByTestId('launch-error');
    await expect(note).toContainText('The launchpad could not store the image and metadata', { timeout: 60_000 });
    await expect(note).toContainText('pinning service unavailable');
    await expect(page.getByTestId('launch-action')).toBeEnabled();
    await expect(page.getByLabel('Agent name')).toHaveValue('[qa3] upload fails');
    expect(await page.evaluate(() => (window as unknown as { __qaWallet: { signs: number } }).__qaWallet.signs)).toBe(0);

    /* The launchpad itself unreachable: the message says so, without a raw fetch error. */
    await page.unroute(METADATA);
    await page.route(METADATA, route => route.abort('connectionrefused'));
    await page.getByTestId('launch-action').click();
    await expect(note).toContainText('Could not reach the launchpad', { timeout: 60_000 });
    await expect(note).not.toContainText('Failed to fetch');
  });

  test('the wallet declining the signature is named, nothing is sent, and the form stays', async ({ page }) => {
    test.setTimeout(180_000);
    await page.route(BY_WALLET, route => route.fulfill({ json: { data: [] } }));
    await page.route(METADATA, route =>
      route.fulfill({
        json: {
          data: {
            metadataUri: 'https://gateway.pinata.cloud/ipfs/QmQa3MetadataMockedForTheSuite00000000000000000',
            imageUri: 'https://gateway.pinata.cloud/ipfs/QmQa3ImageMockedForTheSuite000000000000000000000',
            thumbnailUri: '',
          },
        },
      }),
    );
    let recorded = 0;
    await page.route(/\/api\/launch(\/record)?$/, route => {
      if (route.request().method() === 'POST') recorded += 1;
      return route.continue();
    });
    await page.goto('/');
    await connectFakeWallet(page);
    await openLaunchForm(page);
    await fillIdentity(page, '[qa3] wallet declines', 'QADECL');
    await page.getByTestId('launch-action').click();
    const note = page.getByTestId('launch-error');
    await expect(note).toContainText('You rejected the transaction in your wallet.', { timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as { __qaWallet: { signs: number } }).__qaWallet.signs)).toBe(1);
    expect(recorded).toBe(0);
    await expect(page.getByTestId('launch-action')).toBeEnabled();
    await expect(page.getByTestId('launch-success')).toHaveCount(0);
    await expect(page.getByLabel('Symbol')).toHaveValue('QADECL');
  });

  test('a wallet that already launched is sent to its agent instead of a second launch', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(BY_WALLET, route =>
      route.fulfill({
        json: {
          data: [
            {
              mint: '2ot6zTtA9BSip6tx8DGDWaENZ5eu54E7WMzW8JfnvYtn',
              name: 'MOUSE',
              symbol: 'RAT',
              creator_wallet: QA_WALLET_ADDRESS,
              status: 'pending',
            },
          ],
        },
      }),
    );
    await page.goto('/');
    await connectFakeWallet(page);
    await expect(
      page.getByTestId('launchpad-open-form').or(page.getByTestId('hero-agent-step')).or(page.getByTestId('nav-your-agent')).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    /* Either the home moved to Step 2 for this launch, or the form refuses a second one. */
    const step2 = page.getByTestId('run-agent-flow');
    if (await step2.isVisible().catch(() => false)) {
      await expect(page.getByTestId('token-launched-card').or(page.getByTestId('hero-agent-step')).first()).toBeVisible();
      return;
    }
    await openLaunchForm(page);
    await fillIdentity(page, '[qa3] second launch', 'QATWO');
    await page.getByTestId('launch-action').click();
    await expect(page.getByTestId('launch-record-exists')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('launch-record-exists-link')).toHaveAttribute('href', /\/tokens\//);
  });
});

test.describe('Allow local access gate', () => {
  test('a browser that denies local network access is told how to unblock it, with Recheck and a bypass', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedVisitor(context, { installed: false });
    await installFakeWallet(context);
    await page.route(DRIP, route => route.fulfill({ json: { data: { ok: true, skipped: true } } }));
    /* No agent yet on this machine: Step 2 offers the installer. */
    await page.route(`${QA_DAEMON_URL}/**`, route => route.abort('connectionrefused'));
    /* The permission API says no; the daemon is not the point here. */
    await context.addInitScript(() => {
      const denied = { state: 'denied', onchange: null, addEventListener() {}, removeEventListener() {} };
      const original = navigator.permissions?.query?.bind(navigator.permissions);
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: {
          query: (desc: { name: string }) =>
            /local|loopback/.test(desc.name)
              ? Promise.resolve(denied)
              : original
                ? original(desc as PermissionDescriptor)
                : Promise.reject(new TypeError('unsupported')),
        },
      });
      localStorage.setItem(
        'stonkagents:launch:HaKT7Tv8ryZBZTiom5NSdwhahuMFPkEcGvausaNbcZyh',
        JSON.stringify({
          mint: '2ot6zTtA9BSip6tx8DGDWaENZ5eu54E7WMzW8JfnvYtn',
          name: 'MOUSE',
          symbol: 'RAT',
          quoteSymbol: 'STONK',
          launchedAt: new Date().toISOString(),
        }),
      );
    });
    await page.goto('/');
    await connectFakeWallet(page).catch(() => {});
    const download = page.getByTestId('download-installer');
    await expect(download).toBeVisible({ timeout: 60_000 });
    await download.click();
    /* Each gated link mounts its own dialog; the open one is the visible one. */
    const gate = page.getByTestId('local-access-gate').filter({ visible: true }).first();
    await expect(gate).toBeVisible();
    await gate.getByTestId('local-access-allow').click();
    await expect(gate.getByTestId('local-access-denied')).toBeVisible({ timeout: 15_000 });
    await expect(gate.getByTestId('local-access-bypass')).toHaveCount(0);
    await gate.getByTestId('local-access-allow').click();
    await expect(gate.getByTestId('local-access-denied')).toBeVisible({ timeout: 15_000 });
    await expect(gate.getByTestId('local-access-bypass')).toBeVisible();
  });
});
