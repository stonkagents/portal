/**
 * Purpose: Tests for the release version compare behind the installer gate.
 */
import { describe, it, expect } from 'vitest';
import { compareVersions, parseVersion } from '../version';

describe('parseVersion', () => {
  it('reads dotted numbers with an optional v, pre-release and build tag', () => {
    expect(parseVersion('2.6.1')).toEqual({ parts: [2, 6, 1], prerelease: '' });
    expect(parseVersion(' v2.6 ')).toEqual({ parts: [2, 6], prerelease: '' });
    expect(parseVersion('2.7.0-rc.1+build.5')).toEqual({ parts: [2, 7, 0], prerelease: 'rc.1' });
  });

  it('is null for anything that is not a version', () => {
    for (const raw of ['dev', '', undefined, null, 'latest', '2.6.x', '2..6']) expect(parseVersion(raw)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders releases numerically, not as text', () => {
    expect(compareVersions('2.6.1', '2.6.1')).toBe(0);
    expect(compareVersions('2.6.1', '2.6.10')).toBeLessThan(0);
    expect(compareVersions('2.10.0', '2.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v2.6.1', '2.6.1')).toBe(0);
    expect(compareVersions('2.6', '2.6.0')).toBe(0);
    expect(compareVersions('3.0.0', '2.99.99')).toBeGreaterThan(0);
  });

  it('sorts a pre-release before its release', () => {
    expect(compareVersions('2.7.0-rc.1', '2.7.0')).toBeLessThan(0);
    expect(compareVersions('2.7.0', '2.7.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('2.7.0-rc.1', '2.7.0-rc.2')).toBeLessThan(0);
    expect(compareVersions('2.7.0-rc.1', '2.6.9')).toBeGreaterThan(0);
  });

  it('is null when either side is not a version', () => {
    expect(compareVersions('dev', '2.6.1')).toBeNull();
    expect(compareVersions('2.6.1', '')).toBeNull();
    expect(compareVersions(undefined, undefined)).toBeNull();
  });
});
