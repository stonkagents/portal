/**
 * Project links on the launch form.
 *
 * A launcher can paste a full link or type just a handle; either way the
 * field settles on one canonical URL that goes into the token metadata. The
 * rules here are format and domain checks only: a browser cannot ask x.com or
 * t.me whether an account exists (CORS), so "exists" is not something this
 * module can promise. The tracker validates the same shapes again on
 * `POST /api/launch/metadata`.
 */

export type ProjectLinkPlatform = 'website' | 'x' | 'telegram';

export type ProjectLinkResult = { ok: true; url: string; handle: string | null; changed: boolean } | { ok: false; reason: string };

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
const TELEGRAM_HOSTS = new Set(['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me', 'telegram.dog']);

/** Paths on x.com that are pages, not accounts. */
const X_RESERVED = new Set([
  'home',
  'explore',
  'search',
  'settings',
  'messages',
  'notifications',
  'i',
  'intent',
  'compose',
  'login',
  'signup',
  'tos',
  'privacy',
  'about',
  'hashtag',
  'share',
]);

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
/** Telegram: 5-32 chars, letters, digits, underscores, must start with a letter. */
const TELEGRAM_HANDLE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function parseUrl(raw: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
}

function firstSegment(url: URL): string {
  return url.pathname.split('/').filter(Boolean)[0] ?? '';
}

function normalizeHandleInput(raw: string): string {
  return raw.trim().replace(/^@/, '');
}

/** True when the text looks like a bare handle rather than a link. */
function looksLikeHandle(raw: string): boolean {
  return !/[/.]/.test(raw) && !/\s/.test(raw);
}

function normalizeWebsite(raw: string): ProjectLinkResult {
  if (/\s/.test(raw)) return { ok: false, reason: 'A web address cannot contain spaces' };
  const url = parseUrl(raw);
  if (!url || !HOSTNAME.test(url.hostname)) {
    return { ok: false, reason: 'Enter a web address like yourproject.com' };
  }
  if (X_HOSTS.has(url.hostname)) return { ok: false, reason: 'That is an X link. Put it in the X field.' };
  if (TELEGRAM_HOSTS.has(url.hostname)) return { ok: false, reason: 'That is a Telegram link. Put it in the Telegram field.' };
  url.protocol = 'https:';
  url.hash = '';
  const canonical = url.toString().replace(/\/$/, '');
  return { ok: true, url: canonical, handle: null, changed: canonical !== raw.trim() };
}

function normalizeX(raw: string): ProjectLinkResult {
  const trimmed = raw.trim();
  let handle: string;
  if (looksLikeHandle(trimmed)) {
    handle = normalizeHandleInput(trimmed);
  } else {
    const url = parseUrl(trimmed);
    if (!url) return { ok: false, reason: 'Enter an X handle or an x.com link' };
    if (!X_HOSTS.has(url.hostname)) return { ok: false, reason: 'X links live on x.com' };
    handle = normalizeHandleInput(firstSegment(url));
  }
  if (!handle) return { ok: false, reason: 'Enter an X handle or an x.com link' };
  if (!X_HANDLE.test(handle)) return { ok: false, reason: 'X handles are 1-15 letters, numbers or underscores' };
  if (X_RESERVED.has(handle.toLowerCase())) return { ok: false, reason: 'That is an X page, not an account' };
  const canonical = `https://x.com/${handle}`;
  return { ok: true, url: canonical, handle, changed: canonical !== trimmed };
}

function normalizeTelegram(raw: string): ProjectLinkResult {
  const trimmed = raw.trim();
  let handle: string;
  if (looksLikeHandle(trimmed)) {
    handle = normalizeHandleInput(trimmed);
  } else {
    const url = parseUrl(trimmed);
    if (!url) return { ok: false, reason: 'Enter a Telegram username or a t.me link' };
    if (!TELEGRAM_HOSTS.has(url.hostname)) return { ok: false, reason: 'Telegram links live on t.me' };
    const segment = firstSegment(url);
    // Invite links (t.me/+code, t.me/joinchat/code) are valid but carry no username.
    if (segment.startsWith('+') || segment === 'joinchat') {
      const canonical = `https://t.me/${url.pathname.split('/').filter(Boolean).join('/')}`;
      return { ok: true, url: canonical, handle: null, changed: canonical !== trimmed };
    }
    handle = normalizeHandleInput(segment);
  }
  if (!handle) return { ok: false, reason: 'Enter a Telegram username or a t.me link' };
  if (!TELEGRAM_HANDLE.test(handle)) {
    return { ok: false, reason: 'Telegram usernames are 5-32 letters, numbers or underscores, starting with a letter' };
  }
  const canonical = `https://t.me/${handle}`;
  return { ok: true, url: canonical, handle, changed: canonical !== trimmed };
}

/**
 * Turn what the launcher typed into one canonical link, or say why it cannot.
 * An empty field is fine: every project link is optional.
 */
export function normalizeProjectLink(platform: ProjectLinkPlatform, raw: string): ProjectLinkResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, url: '', handle: null, changed: raw !== '' };
  switch (platform) {
    case 'website':
      return normalizeWebsite(trimmed);
    case 'x':
      return normalizeX(trimmed);
    case 'telegram':
      return normalizeTelegram(trimmed);
  }
}

/** The zod-facing check: the reason string when invalid, else null. */
export function projectLinkProblem(platform: ProjectLinkPlatform, raw: string): string | null {
  const result = normalizeProjectLink(platform, raw);
  return result.ok ? null : result.reason;
}
