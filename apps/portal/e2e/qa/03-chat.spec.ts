/**
 * QA area 3: agent chat through the QA daemon's relay (one real completion, devnet
 * credits), the agent dying mid-conversation and coming back (Retry resends the message),
 * the Stop button, the command tools notice while the background job runs or fails, and
 * the relay's own refusals (credits, provider) named in the toast.
 *
 * Needs the QA daemon and portal (e2e/qa/README.md). The real completion costs the QA
 * peer's free devnet credits; every other answer here is mocked.
 */
import type { Page } from '@playwright/test';
import { test, expect, seedVisitor, waitForConnected, QA_DAEMON_URL } from './fixtures';

const AGENT_CHAT = /\/api\/v1\/agent\/chat$/;
const COMMAND_TOOLS = /\/controller\/setup\/command-tools(\?|$)/;

function commandTools(overrides: Record<string, unknown>) {
  return {
    state: 'ready',
    phase: '',
    detail: '',
    started_at: null,
    updated_at: null,
    finished_at: null,
    error: null,
    log_path: null,
    attempt: 1,
    cli_present: true,
    gateway_running: true,
    task_name: 'StonkAgents command tools',
    supported: true,
    ...overrides,
  };
}

async function openChat(page: Page) {
  await page.goto('/chat/');
  await waitForConnected(page);
  await expect(page.getByTestId('ac-status-text')).toHaveText('Agent online', { timeout: 20_000 });
  await expect(page.getByTestId('agent-chat-input')).toBeVisible({ timeout: 20_000 });
}

async function sendMessage(page: Page, text: string) {
  await page.getByTestId('agent-chat-input').fill(text);
  await page.getByTestId('agent-chat-send').click();
}

test.describe('Agent chat', () => {
  test('one real completion through the relay: the answer lands, the balance moves, the session persists', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await openChat(page);
    await expect(page.getByTestId('ac-credits')).toContainText(/free/, { timeout: 20_000 });
    const before = parseInt((await page.getByTestId('ac-credits').innerText()).replace(/[^0-9][^]*$/, ''), 10);

    await sendMessage(page, '[qa3] Reply with the single word PONG and nothing else.');
    await expect(page.getByTestId('ac-stop-btn')).toBeVisible({ timeout: 10_000 });
    /* The restored session may already hold an earlier PONG: wait for the round trip itself to end. */
    await expect(page.getByTestId('ac-stop-btn')).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByTestId('chat-bubble-agent').last()).toContainText(/PONG/i);
    await expect
      .poll(async () => parseInt((await page.getByTestId('ac-credits').innerText()).replace(/[^0-9][^]*$/, ''), 10), {
        timeout: 20_000,
      })
      .toBeLessThan(before);

    /* The session is remembered: a reload restores the thread. */
    await page.reload();
    await waitForConnected(page);
    await expect(page.getByTestId('chat-bubble-agent').filter({ hasText: /PONG/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('the agent dies mid-conversation: a named toast with Retry, the message is kept and resent once it is back', async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await seedVisitor(context);
    await openChat(page);

    /* The completion request is refused (the agent is gone); the health poll still answers for a moment. */
    await page.route(AGENT_CHAT, route => route.abort('connectionrefused'));
    const text = '[qa3] Reply with the single word RETRIED and nothing else.';
    await sendMessage(page, text);
    const toasts = page.getByTestId('toast-container');
    await expect(toasts).toContainText("Can't reach your agent.", { timeout: 20_000 });
    await expect(toasts).toContainText('Retry sends it again');
    /* One user bubble, no answer, the composer free again. */
    await expect(page.getByTestId('chat-bubble-user').filter({ hasText: 'RETRIED' })).toHaveCount(1);
    await expect(page.getByTestId('ac-stop-btn')).toHaveCount(0);

    /* The agent is back: Retry resends the same message, no second bubble. */
    await page.unroute(AGENT_CHAT);
    await page.route(AGENT_CHAT, route => route.fulfill({ json: { response: 'RETRIED', credits_deducted: 0 } }));
    await toasts.locator('[data-testid^="toast-action-"]').filter({ hasText: 'Retry' }).first().click();
    await expect(page.getByTestId('chat-bubble-agent').filter({ hasText: /RETRIED/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-bubble-user').filter({ hasText: 'RETRIED' })).toHaveCount(1);
  });

  test('the whole agent vanishing flips the page to offline and back without a reload', async ({ page, context }) => {
    test.setTimeout(150_000);
    await seedVisitor(context);
    await openChat(page);
    await page.route(`${QA_DAEMON_URL}/**`, route => route.abort('connectionrefused'));
    await expect(page.getByTestId('ac-status-text')).toHaveText('Agent offline', { timeout: 30_000 });
    await expect(page.getByTestId('chat-daemon-panel-expand')).toBeVisible();
    await page.unroute(`${QA_DAEMON_URL}/**`);
    await expect(page.getByTestId('ac-status-text')).toHaveText('Agent online', { timeout: 90_000 });
    await expect(page.getByTestId('chat-daemon-panel-expand')).toHaveCount(0);
  });

  test('Stop cancels a slow answer and says the credits were refunded', async ({ page, context }) => {
    await seedVisitor(context);
    await openChat(page);
    await page.route(AGENT_CHAT, () => new Promise<void>(() => {}));
    await sendMessage(page, '[qa3] take your time');
    await page.getByTestId('ac-stop-btn').click();
    await expect(page.getByTestId('chat-bubble-agent').last()).toContainText('Stopped. Credits refunded.', { timeout: 10_000 });
    await expect(page.getByTestId('ac-stop-btn')).toHaveCount(0);
    await expect(page.getByTestId('agent-chat-input')).toBeEnabled();
  });

  test('the relay refusing (provider down) names the reason and does not blame the agent', async ({ page, context }) => {
    await seedVisitor(context);
    await openChat(page);
    await page.route(AGENT_CHAT, route =>
      route.fulfill({
        status: 502,
        json: { error: { code: 'TRACKER_ERROR', message: 'The AI provider answered 429: quota exhausted.' } },
      }),
    );
    await sendMessage(page, '[qa3] anything');
    const toasts = page.getByTestId('toast-container');
    await expect(toasts).toContainText('Your agent could not get an AI response', { timeout: 20_000 });
    await expect(toasts).toContainText('quota exhausted');
    await expect(toasts).toContainText('credits were not charged');
    await expect(toasts.locator('[data-testid^="toast-action-"]').filter({ hasText: 'Retry' })).toBeVisible();
  });

  test('no credits: the paywall banner, not a generic error', async ({ page, context }) => {
    await seedVisitor(context);
    await openChat(page);
    await page.route(AGENT_CHAT, route =>
      route.fulfill({ status: 402, json: { error: { code: 'INSUFFICIENT_CREDITS', message: 'no credits' } } }),
    );
    await sendMessage(page, '[qa3] anything');
    await expect(page.getByTestId('ac-insufficient-credits')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Command tools notice', () => {
  test('while the background job runs the composer is replaced by the notice with its phase', async ({ page, context }) => {
    await seedVisitor(context);
    await page.route(COMMAND_TOOLS, route =>
      route.fulfill({
        json: commandTools({
          state: 'running',
          phase: 'Downloading the command tools',
          detail: '213 package files ready',
          started_at: new Date().toISOString(),
          gateway_running: false,
        }),
      }),
    );
    await page.goto('/chat/');
    await waitForConnected(page);
    const notice = page.getByTestId('command-tools-notice');
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText('Downloading the command tools');
    await expect(page.getByTestId('command-tools-notice-progress')).toBeVisible();
    await expect(page.getByTestId('agent-chat-input')).toHaveCount(0);
    await expect(page.getByTestId('command-tools-chip')).toBeVisible();
  });

  test('a failed job names the error and offers Retry; a refused retry says why', async ({ page, context }) => {
    await seedVisitor(context);
    await page.route(COMMAND_TOOLS, route =>
      route.fulfill({
        json: commandTools({
          state: 'failed',
          phase: 'Installing the command tools',
          error: 'exit 1: npm ERR! network request to https://registry.npmjs.org failed',
          finished_at: new Date().toISOString(),
          gateway_running: false,
        }),
      }),
    );
    await page.route(/\/controller\/setup\/command-tools\/retry$/, route =>
      route.fulfill({ status: 409, json: { error: { code: 'ALREADY_RUNNING', message: 'A setup run is already in progress.' } } }),
    );
    await page.goto('/chat/');
    await waitForConnected(page);
    const notice = page.getByTestId('command-tools-notice');
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText(/npm ERR!|network request/);
    await page.getByTestId('command-tools-notice-retry').click();
    await expect(page.getByTestId('command-tools-notice-retry-error')).toContainText(/already in progress|in progress/i, {
      timeout: 15_000,
    });
  });

  test('no controller (a 502 from the proxy) leaves chat usable with no notice', async ({ page, context }) => {
    await seedVisitor(context);
    await openChat(page);
    await expect(page.getByTestId('command-tools-notice')).toHaveCount(0);
    await expect(page.getByTestId('command-tools-chip')).toHaveCount(0);
  });
});
