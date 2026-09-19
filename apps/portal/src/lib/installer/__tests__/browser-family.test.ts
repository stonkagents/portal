/**
 * Purpose: Tests for the browser family read from the user agent: Edge before
 *          Chrome (its UA carries both), the other Chromium builds as Chrome,
 *          Firefox and Safari by their own tokens, anything else unknown.
 */
import { describe, it, expect } from 'vitest';
import { detectBrowserFamily, isChromium } from '../browser-family';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('detectBrowserFamily', () => {
  it('tells Edge from Chrome, on desktop and mobile', () => {
    expect(detectBrowserFamily(`${CHROME} Edg/140.0.0.0`)).toBe('edge');
    expect(
      detectBrowserFamily('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0'),
    ).toBe('edge');
    expect(detectBrowserFamily(CHROME)).toBe('chrome');
  });

  it('counts the other Chromium builds as Chrome: Brave reports as Chrome, Opera and Vivaldi add their token', () => {
    expect(detectBrowserFamily(`${CHROME} OPR/120.0.0.0`)).toBe('chrome');
    expect(detectBrowserFamily(`${CHROME} Vivaldi/7.0`)).toBe('chrome');
    expect(
      detectBrowserFamily(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('chrome');
  });

  it('knows Firefox and Safari by their own tokens', () => {
    expect(detectBrowserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('firefox');
    expect(
      detectBrowserFamily(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
      ),
    ).toBe('firefox');
    expect(
      detectBrowserFamily(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      ),
    ).toBe('safari');
  });

  it('is unknown for anything else, including no user agent at all', () => {
    expect(detectBrowserFamily('curl/8.0')).toBe('unknown');
    expect(detectBrowserFamily('')).toBe('unknown');
    expect(detectBrowserFamily(undefined)).toBe('unknown');
  });

  it('isChromium: Chrome and Edge share the Apps on device panel', () => {
    expect(isChromium('chrome')).toBe(true);
    expect(isChromium('edge')).toBe(true);
    expect(isChromium('firefox')).toBe(false);
    expect(isChromium('safari')).toBe(false);
    expect(isChromium('unknown')).toBe(false);
  });
});
