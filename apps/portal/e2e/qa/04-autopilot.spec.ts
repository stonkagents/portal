/**
 * QA area 4: the autopilot controls (Settings > Autonomy) against the QA daemon: every
 * mode, category, budget and switch, the inline validation, Reset, a real save that the
 * daemon writes to its config (with a balance floor the agent can never spend under, so
 * the watcher drafts nothing), and the suggestions inbox on the board with the daemon's
 * suggestion routes mocked (they need the LLM). Plus the failed states: a refused policy,
 * an agent that does not answer, an older agent without the surface.
 *
 * Needs the QA daemon and portal (e2e/qa/README.md).
 */
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, seedVisitor, waitForConnected, QA_DAEMON_URL, QA_PREFIX } from './fixtures';

const AUTOPILOT = /\/api\/v1\/setup\/autopilot(\?|$)/;
const SUGGESTIONS = /\/api\/v1\/setup\/autopilot\/suggestions(\?|$)/;
const SUGGESTION_ACTION = /\/api\/v1\/setup\/autopilot\/suggestions\/[^/]+\/(approve|dismiss)$/;

async function openAutonomy(page: Page) {
  await page.goto('/settings/#autonomy');
  await waitForConnected(page);
  await expect(page.getByTestId('autopilot-form')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('autopilot-form')).not.toHaveAttribute('disabled', { timeout: 20_000 });
}

/** A fresh read of the daemon's policy, straight from its API. */
async function daemonPolicy(request: APIRequestContext) {
  const res = await request.get(`${QA_DAEMON_URL}/api/v1/setup/autopilot`);
  return ((await res.json()) as { data: { policy: Record<string, unknown> } }).data.policy;
}

/** Leaves the QA daemon in the state the suite expects: off. */
async function resetPolicy(request: APIRequestContext) {
  /* Best effort: after a skipped test there is no daemon to reset. */
  await request
    .post(`${QA_DAEMON_URL}/api/v1/setup/autopilot`, {
      headers: { 'Content-Type': 'application/json', 'X-StonkAgents-Setup': '1', Origin: 'http://localhost:3013' },
      data: {
        mode: 'off',
        instruction: '',
        balanceFloor: 20,
        dailyCreditCap: 30,
        officeHours: null,
        digest: { enabled: false, weekday: 1, hour: 9 },
      },
    })
    .catch(() => undefined);
}

test.describe('Autopilot controls', () => {
  /* The daemon's policy is the suite's shared state: start and end every test from the same place. */
  test.beforeEach(async ({ request }) => {
    await resetPolicy(request);
  });
  test.afterEach(async ({ request }) => {
    await resetPolicy(request);
  });

  test('the form shows the agent policy, every mode and budget, and Save waits for a change', async ({ page, context }) => {
    await seedVisitor(context);
    await openAutonomy(page);
    await expect(page.getByTestId('autopilot-mode-off')).toBeChecked();
    for (const mode of ['off', 'suggest', 'bounty', 'auto']) await expect(page.getByTestId(`autopilot-mode-${mode}`)).toBeVisible();
    await expect(page.getByTestId('autopilot-category-request')).toBeChecked();
    await expect(page.getByTestId('autopilot-category-token-offer')).toBeDisabled();
    for (const key of ['dailyCreditCap', 'maxRepliesPerDay', 'balanceFloor', 'threadCooldownHours', 'maxPostAgeHours']) {
      await expect(page.getByTestId(`autopilot-${key}`)).toHaveValue(/^\d+$/);
    }
    await expect(page.getByTestId('autopilot-minBountyMultiple')).toHaveCount(0);
    await expect(page.getByTestId('autopilot-save')).toBeDisabled();
    await expect(page.getByTestId('autopilot-status')).toContainText(/Today: \d+ repl/);

    /* Bounty hunter reveals the multiple; Off hides it again. */
    await page.getByTestId('autopilot-mode-bounty').check();
    await expect(page.getByTestId('autopilot-minBountyMultiple')).toBeVisible();
    await page.getByTestId('autopilot-mode-off').check();
    await expect(page.getByTestId('autopilot-minBountyMultiple')).toHaveCount(0);
    await expect(page.getByTestId('autopilot-save')).toBeDisabled();
  });

  test('validation happens inline and blocks Save; Reset drops every edit', async ({ page, context }) => {
    await seedVisitor(context);
    await openAutonomy(page);
    await page.getByTestId('autopilot-mode-suggest').check();
    await expect(page.getByTestId('autopilot-save')).toBeEnabled();

    await page.getByTestId('autopilot-dailyCreditCap').fill('0');
    await expect(page.getByTestId('autopilot-dailyCreditCap-invalid')).toBeVisible();
    await expect(page.getByTestId('autopilot-save')).toBeDisabled();
    await page.getByTestId('autopilot-dailyCreditCap').fill('25');
    await expect(page.getByTestId('autopilot-dailyCreditCap-invalid')).toHaveCount(0);

    await page.getByTestId('autopilot-maxRepliesPerDay').fill('101');
    await expect(page.getByTestId('autopilot-maxRepliesPerDay-invalid')).toBeVisible();
    await page.getByTestId('autopilot-maxRepliesPerDay').fill('3');

    await page.getByTestId('autopilot-category-request').uncheck();
    await expect(page.getByTestId('autopilot-categories-invalid')).toContainText('Tick at least one category');
    await page.getByTestId('autopilot-category-general').check();
    await expect(page.getByTestId('autopilot-categories-invalid')).toHaveCount(0);

    /* The textarea caps at 500 itself: the counter shows the ceiling, nothing over it gets in. */
    await page.getByTestId('autopilot-instruction').fill('x'.repeat(501));
    await expect(page.getByTestId('autopilot-instruction-count')).toContainText('500/500');
    await expect(page.getByTestId('autopilot-instruction-invalid')).toHaveCount(0);
    await page.getByTestId('autopilot-instruction').fill('short');

    await page.getByTestId('autopilot-office-hours').click();
    await page.getByTestId('autopilot-office-start').fill('09:00');
    await page.getByTestId('autopilot-office-end').fill('09:00');
    await expect(page.getByTestId('autopilot-office-hours-invalid')).toContainText('Start and end must differ');
    await expect(page.getByTestId('autopilot-save')).toBeDisabled();
    await page.getByTestId('autopilot-office-end').fill('17:00');
    await expect(page.getByTestId('autopilot-office-hours-invalid')).toHaveCount(0);
    await expect(page.getByTestId('autopilot-save')).toBeEnabled();

    /* Reset: back to the agent's policy, nothing sent. */
    let posted = 0;
    await page.route(AUTOPILOT, route => {
      if (route.request().method() === 'POST') posted += 1;
      return route.continue();
    });
    await page.getByTestId('autopilot-reset').click();
    await expect(page.getByTestId('autopilot-mode-off')).toBeChecked();
    await expect(page.getByTestId('autopilot-category-request')).toBeChecked();
    await expect(page.getByTestId('autopilot-instruction')).toHaveValue('');
    await expect(page.getByTestId('autopilot-office-hours')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('autopilot-save')).toBeDisabled();
    expect(posted).toBe(0);
  });

  test('a real save reaches the agent config and survives a reload; the digest switch needs a day and an hour', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(90_000);
    await seedVisitor(context);
    await openAutonomy(page);
    const instruction = `${QA_PREFIX} standing instruction ${Date.now().toString(36)}`;
    await page.getByTestId('autopilot-mode-suggest').check();
    /* A floor above any balance the QA peer will ever have: the watcher runs and drafts nothing. */
    await page.getByTestId('autopilot-balanceFloor').fill('900000');
    await page.getByTestId('autopilot-dailyCreditCap').fill('25');
    await page.getByTestId('autopilot-instruction').fill(instruction);
    const digest = page.getByTestId('autopilot-digest');
    if ((await digest.getAttribute('aria-checked')) !== 'true') await digest.click();
    await expect(page.getByTestId('autopilot-digest-schedule')).toBeVisible();
    await page.getByTestId('autopilot-digest-weekday').selectOption('5');
    await page.getByTestId('autopilot-digest-hour').selectOption('15');
    await page.getByTestId('autopilot-save').click();
    await expect(page.getByTestId('toast-container')).toContainText('Autopilot settings saved', { timeout: 20_000 });
    await expect(page.getByTestId('autopilot-save')).toBeDisabled();

    const policy = await daemonPolicy(request);
    expect(policy.mode).toBe('suggest');
    expect(policy.balanceFloor).toBe(900000);
    expect(policy.dailyCreditCap).toBe(25);
    expect(policy.instruction).toBe(instruction);
    expect(policy.digest).toMatchObject({ enabled: true, weekday: 5, hour: 15 });

    await page.goto('about:blank');
    await openAutonomy(page);
    await expect(page.getByTestId('autopilot-mode-suggest')).toBeChecked();
    await expect(page.getByTestId('autopilot-instruction')).toHaveValue(instruction);
    await expect(page.getByTestId('autopilot-digest')).toHaveAttribute('aria-checked', 'true');
  });

  test('the agent refusing the policy is a named toast and the edit stays; an unanswered save says so', async ({ page, context }) => {
    await seedVisitor(context);
    await openAutonomy(page);
    await page.route(AUTOPILOT, route =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 400,
            json: { error: { code: 'INVALID_REQUEST', message: 'daily_credit_cap must be at most 100000' } },
          })
        : route.continue(),
    );
    await page.getByTestId('autopilot-mode-auto').check();
    await page.getByTestId('autopilot-save').click();
    const toasts = page.getByTestId('toast-container');
    await expect(toasts).toContainText('Could not save autopilot settings', { timeout: 15_000 });
    await expect(toasts).toContainText('daily_credit_cap must be at most 100000');
    await expect(page.getByTestId('autopilot-mode-auto')).toBeChecked();
    await expect(page.getByTestId('autopilot-save')).toBeEnabled();

    await page.unroute(AUTOPILOT);
    await page.route(AUTOPILOT, route => (route.request().method() === 'POST' ? new Promise<void>(() => {}) : route.continue()));
    await page.getByTestId('autopilot-save').click();
    await expect(toasts).toContainText('Your agent did not answer. Try again.', { timeout: 30_000 });
    await expect(page.getByTestId('autopilot-save')).toBeEnabled();
  });

  test('a policy that cannot be read names it with a Retry; an older agent says it needs an update', async ({ page, context }) => {
    await seedVisitor(context);
    let fail = true;
    await page.route(AUTOPILOT, route =>
      fail && route.request().method() === 'GET'
        ? route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
        : route.continue(),
    );
    await page.goto('/settings/#autonomy');
    await waitForConnected(page);
    const failed = page.getByTestId('autopilot-load-failed');
    await expect(failed).toContainText('Could not read autopilot settings', { timeout: 30_000 });
    await expect(page.getByTestId('autopilot-form')).toHaveAttribute('disabled', '');
    fail = false;
    await page.getByTestId('autopilot-load-retry').click();
    await expect(failed).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('autopilot-form')).not.toHaveAttribute('disabled');

    await page.unroute(AUTOPILOT);
    await page.route(AUTOPILOT, route => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'no' } } }));
    await page.goto('about:blank');
    await page.goto('/settings/#autonomy');
    await waitForConnected(page);
    await expect(page.getByTestId('autopilot-unsupported')).toContainText('needs an update', { timeout: 30_000 });
    await expect(page.getByTestId('autopilot-form')).toHaveAttribute('disabled', '');
  });
});

test.describe('Suggestions inbox', () => {
  const suggestion = {
    id: 'qa3-suggestion-1',
    postId: 'd1438876-7f21-482e-a1af-0db24d750568',
    postTitle: '[qa3] a request the agent drafted for',
    postAuthorName: 'qa3_B',
    category: 'request',
    bounty: { amount: 20, currency: 'credits' },
    draft: `${QA_PREFIX} Here is a draft answer your agent wrote. It is long enough to be folded away behind Show more so the row stays compact until you open it, and it names the trade-off clearly.`,
    estimatedCredits: 10,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    relevance: 0.82,
  };

  test('a waiting draft is listed with its cost; Approve posts it, Dismiss drops it, a gone draft says so', async ({
    page,
    context,
  }) => {
    await seedVisitor(context);
    let items = [suggestion, { ...suggestion, id: 'qa3-suggestion-2', postTitle: '[qa3] a second one' }];
    await page.route(SUGGESTIONS, route => route.fulfill({ json: { data: items } }));
    let approved = 0;
    await page.route(SUGGESTION_ACTION, route => {
      const url = route.request().url();
      const id = url.split('/').slice(-2)[0];
      if (id === 'qa3-suggestion-2') return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'gone' } } });
      approved += url.endsWith('/approve') ? 1 : 0;
      items = items.filter(s => s.id !== id);
      return route.fulfill({ json: url.endsWith('/approve') ? { data: { replyId: 'r-qa3' } } : { data: true } });
    });
    await page.goto('/community/');
    await waitForConnected(page);
    const inbox = page.getByTestId('suggested-replies');
    await expect(inbox).toBeVisible({ timeout: 30_000 });
    await expect(inbox).toContainText('2');
    const row = page.getByTestId('suggestion-qa3-suggestion-1');
    if (!(await row.isVisible())) await page.getByTestId('suggested-replies-toggle').click();
    await expect(row).toBeVisible();
    await expect(page.getByTestId('suggestion-qa3-suggestion-1-credits')).toContainText('10');
    await expect(page.getByTestId('suggestion-qa3-suggestion-1-bounty')).toContainText('20');
    await page.getByTestId('suggestion-qa3-suggestion-1-expand').click();
    await expect(page.getByTestId('suggestion-qa3-suggestion-1-draft')).toContainText('names the trade-off');

    await page.getByTestId('suggestion-qa3-suggestion-1-approve').click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
    expect(approved).toBe(1);

    /* The second draft expired on the agent meanwhile: Dismiss is told it is gone. */
    await page.getByTestId('suggestion-qa3-suggestion-2-dismiss').click();
    await expect(page.getByTestId('toast-container')).toContainText(/gone|expired/i, { timeout: 15_000 });
  });

  test('an empty inbox renders nothing', async ({ page, context }) => {
    await seedVisitor(context);
    await page.route(SUGGESTIONS, route => route.fulfill({ json: { data: [] } }));
    await page.goto('/community/');
    await waitForConnected(page);
    await expect(page.getByTestId('compose-post')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('suggested-replies')).toHaveCount(0);
  });
});
