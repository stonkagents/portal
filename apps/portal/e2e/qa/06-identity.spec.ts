/**
 * QA area 6: identity and the display name. Settings > Identity shows the agent's peer id
 * and lets the owner rename it; the name is written to the agent config, pushed to the
 * tracker, and shows up on the network list, the daemon's own board profile and a post.
 * Validation (too long, unchanged), the agent refusing, and an older agent without the
 * surface. The name is put back to "qa3_A" at the end.
 *
 * Needs the QA daemon and portal (e2e/qa/README.md).
 */
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, seedVisitor, waitForConnected, QA_DAEMON_URL, QA_TRACKER_URL } from './fixtures';

const IDENTITY = /\/api\/v1\/setup\/identity(\?|$)/;
const BASE_NAME = 'qa3_A';

async function openIdentity(page: Page) {
  await page.goto('/settings/#identity');
  await waitForConnected(page);
  const field = page.getByTestId('settings-display-name');
  await expect(field).toBeEnabled({ timeout: 20_000 });
  return field;
}

async function setName(request: APIRequestContext, displayName: string) {
  /* Best effort: after a skipped test there is no daemon to reset. */
  await request
    .post(`${QA_DAEMON_URL}/api/v1/setup/identity`, {
      headers: { 'Content-Type': 'application/json', 'X-StonkAgents-Setup': '1', Origin: 'http://localhost:3013' },
      data: { displayName },
    })
    .catch(() => undefined);
}

test.describe('Identity and display name', () => {
  test.afterEach(async ({ request }) => {
    await setName(request, BASE_NAME);
  });

  test('the Identity tab shows the peer id and the current name; Save waits for a real change', async ({ page, context, daemon }) => {
    await seedVisitor(context);
    const field = await openIdentity(page);
    await expect(page.getByTestId('settings-peerid')).toHaveValue(new RegExp(daemon.peerId.slice(0, 12)));
    await expect(field).toHaveValue(BASE_NAME);
    const save = page.getByTestId('settings-display-name-save');
    await expect(save).toBeDisabled();
    /* Whitespace around the same name is not a change. */
    await field.fill(`  ${BASE_NAME}  `);
    await expect(save).toBeDisabled();
    await field.fill('x'.repeat(51));
    await expect(page.getByTestId('settings-display-name-too-long')).toBeVisible();
    await expect(save).toBeDisabled();
    await field.fill('x'.repeat(50));
    await expect(page.getByTestId('settings-display-name-too-long')).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  test('a new name reaches the agent, the tracker, the network list, the board profile and the navbar', async ({
    page,
    context,
    request,
    daemon,
  }) => {
    test.setTimeout(150_000);
    await seedVisitor(context);
    const field = await openIdentity(page);
    const name = `qa3_A renamed ${Date.now().toString(36)}`;
    await field.fill(name);
    await page.getByTestId('settings-display-name-save').click();
    /* The agent pushes the name to the tracker before answering; on a slow link that takes a while. */
    await expect(page.getByTestId('toast-container')).toContainText('Display name saved', { timeout: 60_000 });
    await expect(field).toHaveValue(name);

    /* The agent has it. */
    const identity = await request.get(`${QA_DAEMON_URL}/api/v1/setup/identity`);
    expect(((await identity.json()) as { data: { displayName: string } }).data.displayName).toBe(name);

    /* The tracker has it: the board profile the daemon proxies, and the public network list. */
    await expect
      .poll(
        async () => {
          const me = await request.get(`${QA_DAEMON_URL}/api/v1/portal/peers/me`);
          return ((await me.json()) as { data: { display_name: string } }).data.display_name;
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBe(name);
    await expect
      .poll(
        async () => {
          const peers = await request.get(`${QA_TRACKER_URL}/api/peers`);
          const list = ((await peers.json()) as { data: { peerId: string; name: string }[] }).data;
          return list.find(p => p.peerId === daemon.peerId)?.name;
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBe(name);

    /* The portal shows it without a reload where it names the owner. */
    await page.getByTestId('avatar-trigger').click();
    await expect(page.getByTestId('avatar-dropdown')).toContainText(name);
    await page.keyboard.press('Escape');
    await page.goto('/peers/');
    await waitForConnected(page);
    await expect(page.getByTestId('peers-page')).toContainText(name, { timeout: 30_000 });
  });

  test('the agent refusing the name is a toast and the field keeps the draft; an unanswered save says so', async ({
    page,
    context,
  }) => {
    await seedVisitor(context);
    const field = await openIdentity(page);
    await page.route(IDENTITY, route =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 400,
            json: { error: { code: 'INVALID_REQUEST', message: 'display name contains a control character' } },
          })
        : route.continue(),
    );
    await field.fill('qa3_A refused');
    await page.getByTestId('settings-display-name-save').click();
    const toasts = page.getByTestId('toast-container');
    await expect(toasts).toContainText('Could not save display name', { timeout: 15_000 });
    await expect(toasts).toContainText('control character');
    await expect(field).toHaveValue('qa3_A refused');

    await page.unroute(IDENTITY);
    await page.route(IDENTITY, route => (route.request().method() === 'POST' ? new Promise<void>(() => {}) : route.continue()));
    await page.getByTestId('settings-display-name-save').click();
    await expect(toasts).toContainText(/did not answer|Try again/, { timeout: 30_000 });
    await expect(page.getByTestId('settings-display-name-save')).toBeEnabled();
  });

  test('an older agent without the identity surface says so instead of a broken field', async ({ page, context }) => {
    await seedVisitor(context);
    await page.route(IDENTITY, route => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'no' } } }));
    await page.goto('/settings/#identity');
    await waitForConnected(page);
    await expect(page.getByTestId('settings-display-name-unsupported')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('settings-display-name')).toBeDisabled();
  });
});
