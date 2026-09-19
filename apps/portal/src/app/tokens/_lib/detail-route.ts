/**
 * Which mint a token page is for.
 *
 * The static export pre-renders `/tokens/placeholder/` and the CDN serves
 * that shell for every `/tokens/<mint>/`, so `useParams()` can say
 * "placeholder" for a page that is really about a mint. The path in the
 * browser is the truth then; the route param is only trusted when it names a
 * real address.
 */

/** The route segment the static export reserves for the shell. */
export const PLACEHOLDER_SEGMENT = 'placeholder';

const TOKEN_PATH = /^\/tokens\/([^/?#]+)\/?(?:[?#].*)?$/;

/** Base58 32-byte public keys are 32–44 characters from this alphabet. */
const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The raw segment in a `/tokens/<segment>/` path, or null when there is none. */
export function segmentFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = TOKEN_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export interface TokenRoute {
  /** What the URL names, or null for the shell itself (`placeholder`) and for no segment at all. */
  segment: string | null;
  /** The segment when it is a plausible mint address, else null. */
  mint: string | null;
}

/**
 * The route param wins when it names something other than the shell; the
 * browser's path is read otherwise. Absent or `placeholder` means there is
 * nothing to show (404); a segment that is not an address is a bad link.
 */
export function resolveTokenRoute(paramTokenId: unknown, pathname: string | null | undefined): TokenRoute {
  const fromParam = typeof paramTokenId === 'string' && paramTokenId !== PLACEHOLDER_SEGMENT ? paramTokenId : null;
  const raw = fromParam ?? segmentFromPath(pathname);
  const segment = raw && raw !== PLACEHOLDER_SEGMENT ? raw : null;
  return { segment, mint: segment && BASE58_KEY.test(segment) ? segment : null };
}

/** The mint for the page, or null. See `resolveTokenRoute`. */
export function resolveMint(paramTokenId: unknown, pathname: string | null | undefined): string | null {
  return resolveTokenRoute(paramTokenId, pathname).mint;
}
