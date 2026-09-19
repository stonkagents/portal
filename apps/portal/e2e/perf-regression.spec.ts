/**
 * PERF-5: Performance / hygiene regression suite.
 *
 * Runs against the live dev server (PERF_BASE_URL or http://localhost:3003).
 * Run with:  npx playwright test --project=perf --reporter=line
 *
 * Checks:
 *  1. Idle CPU — LayoutCount / TaskDuration deltas over a 10 s idle window (CDP Performance.getMetrics)
 *  2. No localhost daemon traffic (7841 / 7840) and no console errors mentioning those ports
 *  3. External link crawl — HEAD/GET every external <a href>; non-2xx are findings, not failures
 *  4. Brand-word sweep — no legacy brand terms in rendered body text
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE_URL = process.env.PERF_BASE_URL || 'http://localhost:3003';

const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const ROUTES = ['/', '/tokens', '/gallery', '/community', '/chat', '/settings', '/transfers', '/peers'];

const DAEMON_PORTS = ['7841', '7840'];
const TRACKER_PATTERN = /tracker\.dev\.clawagent\.com|localhost:7842|127\.0\.0\.1:7842/;

const BRAND_WORDS = ['daemon', 'swarm', 'Agent Tokens', 'Launch token', 'YOLO'];
// Third-party product names that legitimately contain a brand word. Masked before scanning.
// Keep this list tiny and explicit; every entry is a decision, not a convenience.
const BRAND_ALLOWED_PHRASES = ['OpenClaw'];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Mark splash as seen before any app script runs. */
async function markSplashSeen(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('stonkagents-splash-seen', '1');
      sessionStorage.setItem('stonkagents-splash-seen', '1');
    } catch {
      /* storage unavailable */
    }
  });
}

/** Dismiss the splash if it rendered anyway (defensive). */
async function dismissSplashIfPresent(page: Page) {
  const splash = page.getByTestId('splash-screen');
  try {
    await splash.waitFor({ state: 'visible', timeout: 1_500 });
    const fix = page.getByTestId('splash-fix-btn');
    if (await fix.isVisible().catch(() => false)) await fix.click();
    await splash.waitFor({ state: 'detached', timeout: 10_000 });
  } catch {
    /* not shown */
  }
}

/** Ignore the Next.js dev overlay (portal / shadow host) when reading page content. */
const DEV_OVERLAY_SELECTOR = 'nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-toast], #__next-build-watcher';

async function gotoRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await dismissSplashIfPresent(page);
}

async function getBodyText(page: Page): Promise<string> {
  return page.evaluate(overlaySel => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(overlaySel).forEach(el => el.remove());
    clone.querySelectorAll('script, style, noscript, template').forEach(el => el.remove());
    return clone.innerText || clone.textContent || '';
  }, DEV_OVERLAY_SELECTOR);
}

type CdpMetrics = Record<string, number>;

async function getMetrics(session: Awaited<ReturnType<BrowserContext['newCDPSession']>>): Promise<CdpMetrics> {
  const { metrics } = await session.send('Performance.getMetrics');
  const out: CdpMetrics = {};
  for (const m of metrics as Array<{ name: string; value: number }>) out[m.name] = m.value;
  return out;
}

function summarizeConsoleErrors(errors: string[]) {
  const daemon = errors.filter(e => DAEMON_PORTS.some(p => e.includes(p)));
  const tracker = errors.filter(e => TRACKER_PATTERN.test(e));
  const other = errors.filter(e => !daemon.includes(e) && !tracker.includes(e));
  return { daemon, tracker, other };
}

// ---------------------------------------------------------------------------
// 1. Idle CPU
// ---------------------------------------------------------------------------

test.describe('PERF-5 idle CPU', () => {
  // Idle work is measured with reduced motion on: headless Chromium has no GPU
  // compositor, so even a pure-transform CSS animation costs it a main-thread
  // style recalc every frame, which a real browser does not pay. The ambient
  // animations are guarded separately below by counting the infinite ones.
  test.use({ userAgent: WINDOWS_UA });

  for (const { route, layoutLimit } of [
    { route: '/', layoutLimit: 30 },
    { route: '/gallery', layoutLimit: 40 },
  ]) {
    test(`idle metrics on ${route}`, async ({ page, context }, testInfo) => {
      test.setTimeout(90_000);
      await markSplashSeen(context);
      const session = await context.newCDPSession(page);
      await session.send('Performance.enable');
      // Applied via CDP: the reducedMotion context option is not honoured by this project's fixtures.
      await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

      await gotoRoute(page, route);
      await page.waitForTimeout(5_000);
      const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      const animating = await page.evaluate(() => document.getAnimations().length);
      console.log(`idle setup ${route}: reduced-motion=${reduced}, running animations=${animating}`);

      const before = await getMetrics(session);
      await page.waitForTimeout(10_000);
      const after = await getMetrics(session);

      const layoutDelta = (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0);
      const taskDelta = (after.TaskDuration ?? 0) - (before.TaskDuration ?? 0);
      const styleDelta = (after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0);
      const scriptDelta = (after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0);

      const summary = {
        route,
        idleWindowMs: 10_000,
        LayoutCount: layoutDelta,
        RecalcStyleCount: styleDelta,
        TaskDurationSec: Number(taskDelta.toFixed(3)),
        ScriptDurationSec: Number(scriptDelta.toFixed(3)),
        JSHeapUsedMB: Number(((after.JSHeapUsedSize ?? 0) / 1_048_576).toFixed(1)),
        limits: { LayoutCount: layoutLimit, TaskDurationSec: 0.5 },
      };
      await testInfo.attach(`idle-metrics-${route.replace(/\W+/g, '_') || 'root'}.json`, {
        body: JSON.stringify(summary, null, 2),
        contentType: 'application/json',
      });
      console.log(
        `idle cpu ${route}: LayoutCount +${layoutDelta} (limit ${layoutLimit}), TaskDuration +${taskDelta.toFixed(3)}s (limit 0.5s), RecalcStyle +${styleDelta}, ScriptDuration +${scriptDelta.toFixed(3)}s`,
      );

      expect(layoutDelta, `LayoutCount grew by ${layoutDelta} over 10 s idle on ${route}`).toBeLessThan(layoutLimit);
      expect(taskDelta, `TaskDuration grew by ${taskDelta.toFixed(3)}s over 10 s idle on ${route}`).toBeLessThan(0.5);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. No daemon traffic / no console errors
// ---------------------------------------------------------------------------

test.describe('PERF-5 ambient animations', () => {
  test.use({ userAgent: WINDOWS_UA });

  test('at most one infinite animation runs on / (the logo spin)', async ({ page, context }, testInfo) => {
    await markSplashSeen(context);
    await gotoRoute(page, '/');
    await page.waitForTimeout(6_000);
    const running = await page.evaluate(() =>
      document.getAnimations().map(a => ({
        name: (a as CSSAnimation).animationName ?? a.constructor.name,
        infinite: a.effect?.getTiming().iterations === Infinity,
        target: (a.effect as KeyframeEffect | null)?.target?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
      })),
    );
    await testInfo.attach('animations.json', { body: JSON.stringify(running, null, 2), contentType: 'application/json' });
    const infinite = running.filter(a => a.infinite);
    console.log(`ambient animations on /: ${running.length} running, ${infinite.length} infinite`);
    expect(infinite.length, `infinite animations: ${JSON.stringify(infinite)}`).toBeLessThanOrEqual(1);
  });
});

test.describe('PERF-5 daemon traffic', () => {
  for (const { label, ua } of [
    { label: 'macOS UA', ua: MAC_UA },
    { label: 'Windows UA', ua: WINDOWS_UA },
  ]) {
    test(`no localhost daemon traffic on / (${label})`, async ({ browser }, testInfo) => {
      test.setTimeout(60_000);
      const context = await browser.newContext({ userAgent: ua, baseURL: BASE_URL });
      // Only the splash flag — deliberately no install-detected flag in localStorage.
      await markSplashSeen(context);
      const page = await context.newPage();

      const requests: string[] = [];
      const consoleErrors: string[] = [];
      page.on('request', req => requests.push(req.url()));
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().split('\n')[0].slice(0, 300));
      });
      page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

      await gotoRoute(page, '/');
      await page.waitForTimeout(15_000);

      const daemonRequests = requests.filter(u => {
        try {
          const { hostname, port } = new URL(u);
          return (hostname === 'localhost' || hostname === '127.0.0.1') && DAEMON_PORTS.includes(port);
        } catch {
          return false;
        }
      });
      const { daemon: daemonErrors, tracker: trackerErrors, other: otherErrors } = summarizeConsoleErrors(consoleErrors);

      await testInfo.attach(`daemon-traffic-${label.replace(/\W+/g, '_')}.json`, {
        body: JSON.stringify(
          { ua: label, totalRequests: requests.length, daemonRequests, daemonErrors, trackerErrors, otherErrors },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      console.log(
        `daemon traffic (${label}): ${requests.length} requests, ${daemonRequests.length} to 7841/7840, console errors: ${daemonErrors.length} daemon, ${trackerErrors.length} tracker (allowed), ${otherErrors.length} other`,
      );
      if (otherErrors.length) console.log(`  other console errors (${label}):\n  - ${otherErrors.slice(0, 10).join('\n  - ')}`);

      expect(daemonRequests, `requests to localhost daemon ports (${label})`).toEqual([]);
      expect(daemonErrors, `console errors mentioning 7841/7840 (${label})`).toEqual([]);
      await context.close();
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Link / host crawl
// ---------------------------------------------------------------------------

test.describe('PERF-5 link crawl', () => {
  test.use({ userAgent: WINDOWS_UA });

  test('external links resolve (non-2xx reported as findings)', async ({ page, context, request }, testInfo) => {
    test.setTimeout(240_000);
    await markSplashSeen(context);
    const siteHost = new URL(BASE_URL).host;

    const linkSources = new Map<string, Set<string>>();
    for (const route of ROUTES) {
      await gotoRoute(page, route);
      const hrefs: string[] = await page.evaluate(overlaySel => {
        const overlays = Array.from(document.querySelectorAll(overlaySel));
        return Array.from(document.querySelectorAll('a[href]'))
          .filter(a => !overlays.some(o => o.contains(a)))
          .map(a => (a as HTMLAnchorElement).href);
      }, DEV_OVERLAY_SELECTOR);
      for (const href of hrefs) {
        let u: URL;
        try {
          u = new URL(href);
        } catch {
          continue;
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        if (u.host === siteHost) continue;
        u.hash = '';
        const key = u.toString();
        if (!linkSources.has(key)) linkSources.set(key, new Set());
        linkSources.get(key)!.add(route);
      }
    }

    const urls = Array.from(linkSources.keys()).sort();
    expect(urls.length, 'sanity: expected at least one external link across routes').toBeGreaterThan(0);

    const localhostLinks = urls.filter(u => /^(localhost|127\.0\.0\.1)$/.test(new URL(u).hostname));

    type Result = { url: string; status: number | null; method: 'HEAD' | 'GET'; error?: string; routes: string[] };
    const results: Result[] = [];
    const check = async (url: string): Promise<Result> => {
      const routes = Array.from(linkSources.get(url) ?? []);
      try {
        const head = await request.fetch(url, { method: 'HEAD', timeout: 10_000, maxRedirects: 5 });
        if (head.ok()) return { url, status: head.status(), method: 'HEAD', routes };
      } catch {
        /* fall through to GET */
      }
      try {
        const res = await request.fetch(url, { method: 'GET', timeout: 10_000, maxRedirects: 5 });
        return { url, status: res.status(), method: 'GET', routes };
      } catch (err) {
        return { url, status: null, method: 'GET', error: String((err as Error).message ?? err).split('\n')[0], routes };
      }
    };

    const CONCURRENCY = 6;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < urls.length) {
          const url = urls[cursor++];
          results.push(await check(url));
        }
      }),
    );
    results.sort((a, b) => a.url.localeCompare(b.url));

    const ok = results.filter(r => r.status !== null && r.status >= 200 && r.status < 300);
    const failed = results.filter(r => !ok.includes(r));
    await testInfo.attach('link-crawl.json', {
      body: JSON.stringify({ ok: ok.length, failed: failed.length, results }, null, 2),
      contentType: 'application/json',
    });
    console.log(`link crawl: ${ok.length} ok, ${failed.length} failed`);
    for (const r of failed) {
      console.log(`  FAIL ${r.status ?? 'ERR'} ${r.url} (${r.method}${r.error ? `: ${r.error}` : ''}) on ${r.routes.join(', ')}`);
    }

    expect(localhostLinks, 'external links must not point at localhost').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Brand words
// ---------------------------------------------------------------------------

test.describe('PERF-5 brand words', () => {
  test.use({ userAgent: WINDOWS_UA });

  test('no legacy brand words in rendered body text', async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    await markSplashSeen(context);

    const hits: Array<{ route: string; word: string; context: string }> = [];
    for (const route of ROUTES) {
      await gotoRoute(page, route);
      let text = await getBodyText(page);
      for (const phrase of BRAND_ALLOWED_PHRASES) text = text.split(phrase).join('#'.repeat(phrase.length));
      // File paths (~/.stonkagents/data/logs/daemon.log) are real filesystem names, not copy; mask them.
      text = text.replace(/[~.]?\/?[\w.~-]+(?:\/[\w.~-]+)+/g, m => '#'.repeat(m.length));
      for (const word of BRAND_WORDS) {
        let idx = text.indexOf(word);
        while (idx !== -1) {
          const snippet = text.slice(Math.max(0, idx - 40), idx + word.length + 40).replace(/\s+/g, ' ');
          hits.push({ route, word, context: snippet });
          idx = text.indexOf(word, idx + word.length);
        }
      }
    }

    await testInfo.attach('brand-words.json', {
      body: JSON.stringify(hits, null, 2),
      contentType: 'application/json',
    });
    if (hits.length) {
      console.log(`brand words: ${hits.length} hit(s)`);
      for (const h of hits) console.log(`  ${h.route} "${h.word}" -> …${h.context}…`);
    } else {
      console.log('brand words: 0 hits');
    }

    expect(
      hits.map(h => `${h.route}: "${h.word}" in "${h.context}"`),
      'legacy brand words found in rendered text',
    ).toEqual([]);
  });
});
