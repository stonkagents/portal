/**
 * Purpose: Tests for useInstallerDownloads — manifest-backed URLs, and the gate:
 *          locked means no URL leaves the hook, whatever the manifest names.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const manifest = vi.hoisted(() => ({
  windowsUrl: 'https://releases.example.test/StonkAgents-Setup-2.1.5.exe' as string | undefined,
}));
vi.mock('@/lib/api/manifest', () => ({
  getWindowsInstallerUrl: async () => manifest.windowsUrl,
  getMacOSInstallerUrl: async () => undefined,
  getLatestVersion: async () => '2.1.5',
}));

import { useInstallerDownloads } from '../use-installer-downloads';

beforeEach(() => {
  manifest.windowsUrl = 'https://releases.example.test/StonkAgents-Setup-2.1.5.exe';
});

describe('useInstallerDownloads', () => {
  it('locked: reads the manifest but hands out no URL', async () => {
    const { result } = renderHook(() => useInstallerDownloads(false));
    await waitFor(() => expect(result.current.manifestState).toBe('ready'));
    expect(result.current.unlocked).toBe(false);
    expect(result.current.downloadUrl).toBeUndefined();
    expect(result.current.downloads).toEqual({ macos: undefined, windows: undefined });
  });

  it('unlocked: hands out the manifest-backed Windows installer', async () => {
    const { result } = renderHook(() => useInstallerDownloads(true));
    await waitFor(() => expect(result.current.manifestState).toBe('ready'));
    expect(result.current.unlocked).toBe(true);
    expect(result.current.downloads.windows).toBe('https://releases.example.test/StonkAgents-Setup-2.1.5.exe');
  });

  it('unlocking later exposes the URL the manifest already named, without another fetch', async () => {
    const { result, rerender } = renderHook(({ unlocked }) => useInstallerDownloads(unlocked), {
      initialProps: { unlocked: false },
    });
    await waitFor(() => expect(result.current.manifestState).toBe('ready'));
    expect(result.current.downloads.windows).toBeUndefined();

    rerender({ unlocked: true });
    expect(result.current.downloads.windows).toBe('https://releases.example.test/StonkAgents-Setup-2.1.5.exe');

    rerender({ unlocked: false });
    expect(result.current.downloads.windows).toBeUndefined();
  });

  it('never guesses: a manifest naming no installer is unavailable, locked or not', async () => {
    manifest.windowsUrl = undefined;
    const { result } = renderHook(() => useInstallerDownloads(true));
    await waitFor(() => expect(result.current.manifestState).toBe('unavailable'));
    expect(result.current.downloads.windows).toBeUndefined();
  });
});
