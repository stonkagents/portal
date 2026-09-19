import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_SEGMENT, resolveMint, resolveTokenRoute, segmentFromPath } from './detail-route';

const MINT = 'EMJPUbXXDgEYsftDsh8kw2m89muA7SaVrf2WejVNXEJe';

describe('segmentFromPath', () => {
  it('reads the segment under /tokens/, with or without a trailing slash, query or hash', () => {
    expect(segmentFromPath(`/tokens/${MINT}`)).toBe(MINT);
    expect(segmentFromPath(`/tokens/${MINT}/`)).toBe(MINT);
    expect(segmentFromPath(`/tokens/${MINT}/?tab=trades#top`)).toBe(MINT);
    expect(segmentFromPath('/tokens/placeholder/')).toBe(PLACEHOLDER_SEGMENT);
  });

  it('returns null for anything that is not a token page', () => {
    expect(segmentFromPath('/tokens/')).toBeNull();
    expect(segmentFromPath('/tokens')).toBeNull();
    expect(segmentFromPath(`/other/${MINT}/`)).toBeNull();
    expect(segmentFromPath(`/tokens/${MINT}/extra`)).toBeNull();
    expect(segmentFromPath(null)).toBeNull();
  });
});

describe('resolveTokenRoute', () => {
  it('trusts a route param that names a mint', () => {
    expect(resolveTokenRoute(MINT, '/tokens/placeholder/')).toEqual({ segment: MINT, mint: MINT });
  });

  it('reads the mint from the path when the param is the static shell', () => {
    expect(resolveTokenRoute(PLACEHOLDER_SEGMENT, `/tokens/${MINT}/`)).toEqual({ segment: MINT, mint: MINT });
    expect(resolveTokenRoute(undefined, `/tokens/${MINT}/`)).toEqual({ segment: MINT, mint: MINT });
  });

  it('has nothing to show for the shell itself or no segment', () => {
    expect(resolveTokenRoute(PLACEHOLDER_SEGMENT, '/tokens/placeholder/')).toEqual({ segment: null, mint: null });
    expect(resolveTokenRoute(PLACEHOLDER_SEGMENT, null)).toEqual({ segment: null, mint: null });
    expect(resolveTokenRoute(undefined, '/tokens/')).toEqual({ segment: null, mint: null });
  });

  it('keeps a segment that is not an address, so the page can say so', () => {
    expect(resolveTokenRoute('not-a-mint', null)).toEqual({ segment: 'not-a-mint', mint: null });
    expect(resolveTokenRoute(PLACEHOLDER_SEGMENT, '/tokens/0OIl/')).toEqual({ segment: '0OIl', mint: null });
    expect(resolveMint('not-a-mint', null)).toBeNull();
    expect(resolveMint(PLACEHOLDER_SEGMENT, `/tokens/${MINT}/`)).toBe(MINT);
  });
});
