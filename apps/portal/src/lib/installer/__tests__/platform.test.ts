/**
 * Purpose: the platform detection every localhost probe is gated on (PERF-3).
 */
import { describe, it, expect } from 'vitest';
import { detectPlatform, platformSupportsAgent, platformToOS, INSTALLER_AVAILABILITY } from '../use-installer-downloads';

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
};

describe('detectPlatform', () => {
  it('tells phones apart from desktops, including the iPhone UA that says Mac OS X', () => {
    expect(detectPlatform(UA.windows)).toBe('windows');
    expect(detectPlatform(UA.mac)).toBe('macos');
    expect(detectPlatform(UA.iphone)).toBe('ios');
    expect(detectPlatform(UA.ipad)).toBe('ios');
    expect(detectPlatform(UA.android)).toBe('android');
    expect(detectPlatform(UA.linux)).toBe('other');
  });

  it('treats a Macintosh UA with a touch screen as an iPad', () => {
    expect(detectPlatform(UA.mac, 5)).toBe('ios');
    expect(detectPlatform(UA.mac, 0)).toBe('macos');
  });
});

describe('platformSupportsAgent', () => {
  it('follows INSTALLER_AVAILABILITY: Windows only while the macOS installer is coming soon', () => {
    expect(INSTALLER_AVAILABILITY).toEqual({ macos: 'coming_soon', windows: 'available' });
    expect(platformSupportsAgent('windows')).toBe(true);
    expect(platformSupportsAgent('macos')).toBe(false);
    expect(platformSupportsAgent('ios')).toBe(false);
    expect(platformSupportsAgent('android')).toBe(false);
    expect(platformSupportsAgent('other')).toBe(false);
  });

  it('maps phones to no installer OS', () => {
    expect(platformToOS('windows')).toBe('windows');
    expect(platformToOS('macos')).toBe('macos');
    expect(platformToOS('ios')).toBe('unknown');
    expect(platformToOS('android')).toBe('unknown');
  });
});
