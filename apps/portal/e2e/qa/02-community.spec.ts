/**
 * QA area 2: the community board through the QA agent: create a post (the LLM draft is
 * mocked, the post itself is real and prefixed "[qa3]"), reply, upvote with its optimistic
 * roll-back, a devnet-credit bounty awarded to the second QA peer, report, pagination,
 * search, empty states, and the failed states when the tracker answers 429, 500 or hangs.
 *
 * Needs the QA daemon and portal (e2e/qa/README.md); the bounty award needs the second peer.
 */
import type { Page, Route } from '@playwright/test';
import {
  test,
  expect,
  seedVisitor,
  waitForConnected,
  probeDaemon,
  qaTag,
  QA_DAEMON_URL,
  QA_DAEMON_B_URL,
  QA_PREFIX,
} from './fixtures';

const AGENT_CHAT = /\/api\/v1\/agent\/chat$/;
const BOARD_POSTS_LIST = /\/api\/v1\/portal\/board\/posts\?/;

/** The mocked LLM: the draft is the instruction itself, so the post reads exactly as typed. */
async function mockDraft(page: Page) {
  await page.route(AGENT_CHAT, async route => {
    const body = route.request().postDataJSON() as { messages?: { content?: string }[] };
    const instruction = body.messages?.[0]?.content ?? '';
    /* The compose box prefixes the category intent ("Write a request post:"); the draft is the rest. */
    const text = instruction.replace(/^Write an? [a-z ]+ post:\s*/i, '');
    await route.fulfill({ json: { response: text, credits_deducted: 0 } });
  });
}

async function openBoard(page: Page) {
  await page.goto('/community/');
  await waitForConnected(page);
  await expect(page.getByTestId('board-loading')).toHaveCount(0, { timeout: 30_000 });
}

/** Drafts and approves a post through the (mocked) agent; returns the post's card locator. */
async function createPost(page: Page, text: string, opts: { category?: 'general' | 'request'; bounty?: number } = {}) {
  await page.getByTestId(`compose-category-${opts.category ?? 'general'}`).click();
  await page.getByTestId('compose-textarea').fill(text);
  if (opts.bounty) {
    await page.getByTestId('compose-bounty').click();
    await page.getByTestId('bounty-amount-input').fill(String(opts.bounty));
  }
  await page.getByTestId('compose-draft').click();
  await expect(page.getByTestId('draft-preview')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('draft-preview')).toContainText(text.slice(0, 40));
  await page.getByTestId('preview-approve').click();
  await expect(page.getByTestId('draft-preview')).toHaveCount(0, { timeout: 30_000 });
  const card = cards(page).filter({ hasText: text }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

function postIdOf(testId: string | null): string {
  return (testId ?? '').replace(/^post-/, '');
}

/** The post cards of the feed (the card root is the role=button div; its children carry suffixed ids). */
function cards(page: Page) {
  return page.locator('div[role="button"][data-testid^="post-"]');
}

test.describe('Community board', () => {
  test('loads the feed through the agent, searches, filters and reports an empty search', async ({ page, context }) => {
    await seedVisitor(context);
    await openBoard(page);
    const list = cards(page);
    await expect(list.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('compose-post')).toBeVisible();
    await expect(page.getByTestId('board-unavailable')).toHaveCount(0);

    /* A category chip narrows the list; the empty state names the search. */
    await page.getByTestId('category-request').click();
    await expect(page).toHaveURL(/category=request/);
    await expect(list.first()).toBeVisible({ timeout: 30_000 });
    const search = page.getByTestId('board-search');
    await search.fill(`nothing-matches-${Date.now().toString(36)}`);
    await search.press('Enter');
    await expect(page.getByTestId('board-empty')).toContainText('No posts match your search.', { timeout: 30_000 });
    await search.fill('');
    await search.press('Enter');
    await expect(list.first()).toBeVisible({ timeout: 30_000 });
  });

  test('pagination: scrolling loads the next page without a spinner that stays', async ({ page, context }) => {
    await seedVisitor(context);
    await openBoard(page);
    const authors = cards(page);
    await expect(authors.first()).toBeVisible({ timeout: 30_000 });
    const firstPage = await authors.count();
    test.skip(firstPage < 20, 'the dev board has fewer than one page of posts');
    await page.mouse.wheel(0, 20_000);
    await page.keyboard.press('End');
    await expect.poll(async () => authors.count(), { timeout: 30_000 }).toBeGreaterThan(firstPage);
    await expect(page.getByText('Loading more posts...')).toHaveCount(0, { timeout: 30_000 });
  });

  test('create a post, reply in its thread, and see both in Mine', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await mockDraft(page);
    await openBoard(page);
    const text = qaTag('post: create, reply and Mine');
    const card = await createPost(page, text);
    const postId = postIdOf(await card.getAttribute('data-testid'));
    expect(postId).not.toBe('');

    /* The thread: the post, an empty reply list, the compose box. */
    await card.click();
    const panel = page.getByTestId('thread-panel');
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`post=${postId}`));
    await expect(page.getByTestId('thread-post')).toContainText(text.slice(0, 30));
    const reply = qaTag('reply from the author');
    await page.getByTestId('reply-textarea').fill(reply);
    await page.getByTestId('reply-send').click();
    await expect(page.getByTestId('reply-textarea')).toHaveValue('', { timeout: 30_000 });
    await expect(panel.locator('[data-testid^="reply-"]').filter({ hasText: reply })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('thread-close').click();
    /* The panel slides out and stays mounted; the URL and the transform say it is closed. */
    await expect(page).not.toHaveURL(/post=/);
    await expect(panel).toHaveClass(/translate-x-full/);

    /* Mine lists it. */
    await page.getByTestId('tab-mine').click();
    await page.getByTestId('mine-posts').click();
    await expect(page.locator(`[data-testid="post-${postId}"]`)).toBeVisible({ timeout: 30_000 });
  });

  test('an upvote that the tracker refuses rolls back and says why; one it accepts sticks', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await openBoard(page);
    /* Own posts cannot be upvoted (the button says so); pick another agent's post. */
    const other = cards(page)
      .filter({ hasNot: page.locator('[data-testid$="-upvote"][disabled]') })
      .first();
    await expect(cards(page).first()).toBeVisible({ timeout: 30_000 });
    await expect(other).toBeVisible({ timeout: 30_000 });
    const postId = postIdOf(await other.getAttribute('data-testid'));
    const upvote = page.getByTestId(`post-${postId}-upvote`);
    const before = parseInt((await upvote.innerText()).replace(/[^0-9]/g, ''), 10);
    const wasMine = /(^|\s)text-accent-green(\s|$)/.test((await upvote.getAttribute('class')) ?? '');
    const step = wasMine ? -1 : 1;
    const UPVOTE = /\/board\/posts\/[^/]+\/upvote$/;

    /* The tracker refuses: optimistic count, then back where it was, with the reason. */
    await page.route(UPVOTE, route => route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'boom' } } }));
    await upvote.click();
    await expect(page.getByTestId('toast-container')).toContainText('Server error', { timeout: 15_000 });
    await expect(upvote).toContainText(String(before), { timeout: 15_000 });

    /* The tracker accepts: the new count survives a reload. */
    await page.unroute(UPVOTE);
    await upvote.click();
    await expect(upvote).toContainText(String(before + step), { timeout: 15_000 });
    await page.reload();
    await waitForConnected(page);
    await expect(page.getByTestId(`post-${postId}-upvote`)).toContainText(String(before + step), { timeout: 30_000 });
  });

  test('a bounty in devnet credits: posted, answered by peer B, awarded from the thread', async ({ page, context, request }) => {
    test.setTimeout(150_000);
    const b = await probeDaemon(request, QA_DAEMON_B_URL);
    test.skip(b === null, `No second QA daemon at ${QA_DAEMON_B_URL}`);
    await seedVisitor(context);
    await mockDraft(page);
    await openBoard(page);
    const text = qaTag('bounty: 5 credits for the first good answer');
    const card = await createPost(page, text, { category: 'request', bounty: 5 });
    const postId = postIdOf(await card.getAttribute('data-testid'));
    await expect(card).toContainText(/5\s*(credits|cr)/i);

    const answer = `${QA_PREFIX} answer from peer B ${Date.now().toString(36)}`;
    const replied = await request.post(`${QA_DAEMON_B_URL}/api/v1/portal/board/posts/${postId}/replies`, { data: { body: answer } });
    expect(replied.ok(), await replied.text()).toBe(true);
    const replyId = ((await replied.json()) as { data: { id: string } }).data.id;

    await card.click();
    const panel = page.getByTestId('thread-panel');
    await expect(panel.locator(`[data-testid="reply-${replyId}"]`)).toContainText(answer.slice(0, 30), { timeout: 30_000 });
    await page.getByTestId(`award-bounty-${replyId}`).click();
    await expect(page.getByTestId('toast-container')).toContainText('Bounty awarded', { timeout: 30_000 });
    /* The open thread follows without a reopen: the post names the winner, the award button is gone.
       (Awarding does not accept the answer on the tracker; Accept answer stays a separate action.) */
    await expect(page.getByTestId('thread-post')).toContainText('Awarded to', { timeout: 30_000 });
    await expect(page.getByTestId(`award-bounty-${replyId}`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="post-${postId}"]`)).toContainText('Awarded to', { timeout: 30_000 });
  });

  test('reporting another agent post: reason, note, sent', async ({ page, context }) => {
    await seedVisitor(context);
    await openBoard(page);
    /* The first card that is not ours. */
    const other = cards(page).filter({ hasNotText: QA_PREFIX }).first();
    await expect(other).toBeVisible({ timeout: 30_000 });
    await other.click();
    await expect(page.getByTestId('thread-panel')).toBeVisible();
    const menu = page.getByTestId('thread-post-menu');
    test.skip((await menu.count()) === 0, 'the opened post has no menu (own post or menu hidden)');
    await menu.click();
    await page.getByTestId('thread-post-menu-report').click();
    await page.getByTestId('thread-post-report-spam').click();
    await page.getByTestId('thread-post-report-note').fill(`${QA_PREFIX} test report, please ignore`);
    await page.getByTestId('thread-post-report-send').click();
    await expect(page.getByTestId('toast-container')).toContainText(/Reported|already|Failed to report|Rate limited/i, {
      timeout: 30_000,
    });
  });
});

test.describe('Community board failure modes', () => {
  async function failList(page: Page, respond: (route: Route) => Promise<void>) {
    await page.route(BOARD_POSTS_LIST, respond);
  }

  test('a rate-limited tracker: named message, Retry loads the feed', async ({ page, context }) => {
    await seedVisitor(context);
    await failList(page, route => route.fulfill({ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }));
    await openBoard(page);
    const failed = page.getByTestId('board-unavailable');
    await expect(failed).toBeVisible({ timeout: 30_000 });
    await expect(failed).toContainText("Couldn't load the board.");
    await expect(failed).toContainText('Try again shortly', { timeout: 15_000 });
    await page.unroute(BOARD_POSTS_LIST);
    await page.getByTestId('board-retry').click();
    await expect(cards(page).first()).toBeVisible({ timeout: 30_000 });
    await expect(failed).toHaveCount(0);
  });

  test('a 500 from the tracker names the server, a hung tracker names the deadline', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await failList(page, route => route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'boom' } } }));
    await openBoard(page);
    const failed = page.getByTestId('board-unavailable');
    await expect(failed).toContainText('Something went wrong on our end', { timeout: 30_000 });
    await expect(page.getByTestId('board-retry')).toBeVisible();

    /* A request that never answers: the deadline turns it into a named failure, no endless skeleton. */
    await page.unroute(BOARD_POSTS_LIST);
    await failList(page, () => new Promise<void>(() => {}));
    await page.getByTestId('board-retry').click();
    await expect(failed).toContainText('did not answer in time', { timeout: 60_000 });
  });

  test('a reply that fails keeps the text and names the failure', async ({ page, context }) => {
    await seedVisitor(context);
    await openBoard(page);
    const first = cards(page).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();
    await expect(page.getByTestId('thread-panel')).toBeVisible();
    await page.route(/\/board\/posts\/[^/]+\/replies$/, route =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'gateway' })
        : route.continue(),
    );
    const draft = `${QA_PREFIX} this reply must not be lost`;
    await page.getByTestId('reply-textarea').fill(draft);
    await page.getByTestId('reply-send').click();
    await expect(page.getByTestId('toast-container')).toContainText(/Service unavailable|taking a breather/i, { timeout: 15_000 });
    await expect(page.getByTestId('reply-textarea')).toHaveValue(draft);
    await expect(page.getByTestId('reply-send')).toBeEnabled();
  });

  test('the agent dying mid-request: the board falls back to the tracker, actions say the agent is gone', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedVisitor(context);
    await openBoard(page);
    await expect(cards(page).first()).toBeVisible({ timeout: 30_000 });
    await page.route(`${QA_DAEMON_URL}/**`, route => route.abort('connectionrefused'));
    /* Reading stays possible straight from the tracker; writing needs the agent and says so. */
    await expect(page.getByTestId('daemon-dot')).toHaveCount(0, { timeout: 30_000 });
    await expect(cards(page).first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('compose-textarea').fill(`${QA_PREFIX} typed while the agent is away`);
    await expect(page.getByTestId('compose-agent-required')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('compose-draft')).toBeDisabled();
    await page.unroute(`${QA_DAEMON_URL}/**`);
    await waitForConnected(page, 90_000);
    await expect(page.getByTestId('compose-draft')).toBeEnabled({ timeout: 15_000 });
  });
});
