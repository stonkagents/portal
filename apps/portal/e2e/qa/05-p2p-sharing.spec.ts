/**
 * QA area 5: P2P sharing between the two QA daemons. Peer A shares a plain-text file from
 * the gallery modal (the rule refuses a binary, by name and by content), peer B finds it on
 * the network, downloads it through its own daemon and sees it complete on the transfers
 * page. Pause, Resume and Cancel are exercised on a mocked in-flight transfer (a local
 * transfer of a small file finishes too fast to catch), each hitting its daemon route.
 *
 * Peer B's portal is this same page with every daemon call rerouted to the second daemon.
 * Needs both QA daemons and the portal (e2e/qa/README.md).
 */
import type { Page } from '@playwright/test';
import { test, expect, seedVisitor, waitForConnected, probeDaemon, QA_DAEMON_URL, QA_DAEMON_B_URL, QA_PREFIX } from './fixtures';

const DOWNLOADS_STATUS = /\/api\/v1\/downloads\/status(\?|$)/;

/** Every loopback call of the page goes to daemon B instead of A. */
async function pointAtDaemonB(page: Page) {
  await page.route(`${QA_DAEMON_URL}/**`, async route => {
    const url = route.request().url().replace(QA_DAEMON_URL, QA_DAEMON_B_URL);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      /* The page went away mid-poll (the test ended); nothing to answer. */
      await route.abort().catch(() => {});
    }
  });
}

async function openShareModal(page: Page) {
  await page.goto('/gallery/');
  await waitForConnected(page);
  await page.getByTestId('share-asset-btn').click();
  await expect(page.getByTestId('share-asset-modal')).toBeVisible();
}

function textFile(name: string, sizeKb = 64) {
  const line = `${QA_PREFIX} plain text shared by the QA suite, line of filler for the chunker. `;
  let body = `# ${name}\n\n`;
  while (body.length < sizeKb * 1024) body += line + Math.random().toString(36).slice(2) + '\n';
  return { name, mimeType: 'text/markdown', buffer: Buffer.from(body) };
}

function pngFile(name: string) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { name, mimeType: 'image/png', buffer: Buffer.concat([header, Buffer.alloc(4096, 7)]) };
}

test.describe('Sharing from peer A', () => {
  test('a plain-text file is scanned, shared, and gets a CID; sharing it again is a duplicate', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await openShareModal(page);
    const file = textFile(`qa3-share-${Date.now().toString(36)}.md`);
    await page.getByTestId('share-file-input').setInputFiles(file);
    await page.getByTestId('share-to-swarm-btn').click();
    await expect(page.getByTestId('share-complete-confirmation')).toBeVisible({ timeout: 90_000 });
    const cid = (await page.getByTestId('share-complete-cid').innerText()).trim();
    expect(cid).toMatch(/^baf[a-z0-9]{20,}$/);
    await page.getByTestId('share-done-btn').click();

    /* The same content again: the daemon answers 409 and the modal offers to keep or update. */
    await page.getByTestId('share-asset-btn').click();
    await page.getByTestId('share-file-input').setInputFiles(file);
    await page.getByTestId('share-to-swarm-btn').click();
    await expect(page.getByTestId('share-duplicate-warning')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('share-duplicate-cancel').click();
  });

  test('the text-only rule: a binary is refused by name before upload, and by content by the daemon', async ({ page, context }) => {
    await seedVisitor(context);
    await openShareModal(page);
    await page.getByTestId('share-file-input').setInputFiles(pngFile('qa3-picture.png'));
    const error = page.getByTestId('share-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/plain[- ]text/i);
    await expect(page.getByTestId('share-to-swarm-btn')).toHaveCount(0);

    /* A binary wearing a .md name gets past the name check; the daemon sniffs it and answers 415. */
    await page.getByTestId('share-file-input').setInputFiles({ ...pngFile('qa3-disguised.md'), mimeType: 'text/markdown' });
    await expect(error).toHaveCount(0);
    await page.getByTestId('share-to-swarm-btn').click();
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText(/plain[- ]text/i);
  });

  test('an upload the agent never receives names the agent, not "Failed to fetch"', async ({ page, context }) => {
    await seedVisitor(context);
    await openShareModal(page);
    await page.route(/\/api\/v1\/share$/, route => route.abort('connectionrefused'));
    await page.getByTestId('share-file-input').setInputFiles(textFile('qa3-unreachable.md', 4));
    await page.getByTestId('share-to-swarm-btn').click();
    const error = page.getByTestId('share-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText("Can't reach your agent.");
    await expect(error).not.toContainText('Failed to fetch');
    await expect(page.getByTestId('share-to-swarm-btn')).toBeEnabled();
  });
});

test.describe('Receiving on peer B', () => {
  test('peer B finds the file on the network, downloads it through its daemon, and sees it complete', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(180_000);
    test.skip((await probeDaemon(request, QA_DAEMON_B_URL)) === null, `No second QA daemon at ${QA_DAEMON_B_URL}`);

    /* Peer A shares straight through its API; the gallery modal is covered above. */
    const name = `qa3-transfer-${Date.now().toString(36)}.md`;
    const shared = await request.post(`${QA_DAEMON_URL}/api/v1/share`, { multipart: { file: textFile(name, 256) } });
    expect(shared.ok(), await shared.text()).toBe(true);
    const { cid } = (await shared.json()) as { cid: string };

    await seedVisitor(context);
    await pointAtDaemonB(page);
    await page.goto('/gallery/');
    await waitForConnected(page);
    await page.getByRole('button', { name: 'Search Network' }).click();
    await page.getByTestId('gallery-search-input').fill(name.replace('.md', ''));
    const result = page.getByTestId(`search-result-${cid}`);
    await expect(result).toBeVisible({ timeout: 60_000 });
    await result.getByRole('button', { name: /Download/ }).click();
    await expect(page.getByTestId('toast-container')).toContainText(`Download queued: ${name}`, { timeout: 15_000 });

    await page.goto('/transfers/');
    await waitForConnected(page);
    const card = page.getByTestId(`transfer-card-${cid}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(name);
    /* Completed transfers leave the active list and land in History. */
    await expect(card).toHaveCount(0, { timeout: 120_000 });
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByTestId('history-panel')).toContainText(name, { timeout: 30_000 });

    /* Both daemons now seed it: the tracker lists two peers. */
    const peers = await request.get(
      `https://tracker.dev.stonkagents.com/api/gallery/search?q=${encodeURIComponent(name.replace('.md', ''))}`,
    );
    const list = ((await peers.json()) as { data: { items: { cid: string; peers: number }[] } }).data.items;
    expect(list.find(i => i.cid === cid)?.peers).toBeGreaterThanOrEqual(2);
  });

  test('Pause, Resume and Cancel on an in-flight transfer reach the daemon and the card follows', async ({
    page,
    context,
    request,
  }) => {
    test.skip((await probeDaemon(request, QA_DAEMON_B_URL)) === null, `No second QA daemon at ${QA_DAEMON_B_URL}`);
    await seedVisitor(context);
    await pointAtDaemonB(page);
    const cid = 'bafkreiqa3mockedtransfer0000000000000000000000000000000000';
    let state = 'active';
    /* The daemon reports progress as a fraction of the chunks. */
    let progress = 0.37;
    const status = () => ({
      counts: { queued: 0, active: state === 'active' ? 1 : 0, paused: state === 'paused' ? 1 : 0, completed: 0, failed: 0 },
      downloads:
        state === 'cancelled'
          ? []
          : [
              {
                cid,
                filename: 'qa3-in-flight.md',
                state,
                total_size: 4_000_000,
                total_chunks: 16,
                completed_chunks: 6,
                downloaded_bytes: 1_480_000,
                speed_bps: state === 'active' ? 250_000 : 0,
                progress,
                eta_seconds: 10,
                completed_at: null,
                error_message: null,
                connected_peers: 1,
              },
            ],
      recent: [],
      stats: { total_upload: 0, total_download: 0, upload_speed_bps: 0, download_speed_bps: 0 },
    });
    await page.route(DOWNLOADS_STATUS, route => route.fulfill({ json: status() }));
    const calls: string[] = [];
    await page.route(/\/api\/v1\/downloads\/[^/]+\/(pause|resume|cancel)$/, async route => {
      const action = route.request().url().split('/').pop() ?? '';
      calls.push(action);
      state = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'cancelled';
      progress = 0.37;
      await route.fulfill({ json: { cid, status: state, message: 'ok' } });
    });

    await page.goto('/transfers/');
    await waitForConnected(page);
    const card = page.getByTestId(`transfer-card-${cid}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('37%');
    await page.getByTestId(`transfer-pause-${cid}`).click();
    await expect(page.getByTestId(`transfer-resume-${cid}`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(`transfer-resume-${cid}`).click();
    await expect(page.getByTestId(`transfer-pause-${cid}`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(`transfer-cancel-${cid}`).click();
    await expect(card).toHaveCount(0, { timeout: 15_000 });
    expect(calls).toEqual(['pause', 'resume', 'cancel']);
  });

  test('a transfer action the daemon refuses is a named toast and the card stays', async ({ page, context }) => {
    await seedVisitor(context);
    const cid = 'bafkreiqa3refusedtransfer000000000000000000000000000000000';
    await page.route(DOWNLOADS_STATUS, route =>
      route.fulfill({
        json: {
          counts: { queued: 0, active: 1, paused: 0, completed: 0, failed: 0 },
          downloads: [
            {
              cid,
              filename: 'qa3-refused.md',
              state: 'active',
              total_size: 1000,
              total_chunks: 1,
              completed_chunks: 0,
              downloaded_bytes: 100,
              speed_bps: 10,
              progress: 0.1,
              eta_seconds: 5,
              completed_at: null,
              error_message: null,
              connected_peers: 1,
            },
          ],
          recent: [],
          stats: { total_upload: 0, total_download: 0, upload_speed_bps: 0, download_speed_bps: 0 },
        },
      }),
    );
    await page.route(/\/api\/v1\/downloads\/[^/]+\/pause$/, route =>
      route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'no' } } }),
    );
    await page.goto('/transfers/');
    await waitForConnected(page);
    await page.getByTestId(`transfer-pause-${cid}`).click();
    await expect(page.getByTestId('toast-container')).toContainText('Failed to pause transfer. Try again.', { timeout: 15_000 });
    await expect(page.getByTestId(`transfer-card-${cid}`)).toBeVisible();
  });
});
