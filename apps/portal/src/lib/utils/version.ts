/**
 * Purpose: Release version compare for the installer gate: is the agent on this
 *          computer older than the build this site hands out? Versions are the
 *          dotted numbers the manifest and the daemon's /health report ("2.6.1",
 *          "v2.6.1"), with an optional pre-release tag ("2.7.0-rc.1") that sorts
 *          before the release it precedes. Anything without a leading number
 *          (the daemon's "dev" placeholder, an empty string) is not a version.
 */

/** The numeric parts of a version, or null when the string is not a version. */
export function parseVersion(raw: string | undefined | null): { parts: number[]; prerelease: string } | null {
  const text = (raw ?? '').trim().replace(/^v/i, '');
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text);
  if (!match) return null;
  return { parts: match[1].split('.').map(Number), prerelease: match[2] ?? '' };
}

/**
 * Negative when a is older than b, zero when they are the same release, positive
 * when a is newer. Missing trailing parts count as zero ("2.6" equals "2.6.0").
 * Null when either side is not a version.
 */
export function compareVersions(a: string | undefined | null, b: string | undefined | null): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  const length = Math.max(left.parts.length, right.parts.length);
  for (let i = 0; i < length; i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.prerelease === right.prerelease) return 0;
  /* A pre-release precedes its release; two pre-releases compare as text. */
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}
