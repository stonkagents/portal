/**
 * Purpose: Tests for getInstaller — the installer is only handed out to a wallet that has
 *          launched a token; manifest-backed Windows installer, honest coming-soon for
 *          macOS, no guessed URLs, no notarization claims.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const manifest = vi.hoisted(() => ({
  windowsUrl: 'https://releases.example.test/StonkAgents-Setup-0.4.0.exe' as string | undefined,
  version: '0.4.0' as string | undefined,
}));

vi.mock('@/lib/api/manifest', () => ({
  getWindowsInstallerUrl: async () => manifest.windowsUrl,
  getLatestVersion: async () => manifest.version,
}));

/* The tracker's by-wallet answer is the proof of Step 1. */
const tracker = vi.hoisted(() => ({
  fetchLaunchesByWallet: vi.fn(),
}));
vi.mock('@/lib/api/launches', () => ({
  fetchLaunchesByWallet: (wallet: string) => tracker.fetchLaunchesByWallet(wallet),
}));

import { getInstallerTool } from '../tools/get-installer';

type Result = Record<string, unknown>;

const WALLET = 'Wa11et11111111111111111111111111111111111111';
const LAUNCHED = { wallet: WALLET, platform: 'windows' };

beforeEach(() => {
  vi.clearAllMocks();
  manifest.windowsUrl = 'https://releases.example.test/StonkAgents-Setup-0.4.0.exe';
  manifest.version = '0.4.0';
  tracker.fetchLaunchesByWallet.mockResolvedValue([{ mint: 'MinT', creator_wallet: WALLET }]);
});

describe('getInstallerTool', () => {
  it('has the tool name, asks for the launching wallet, and claims no signing or notarization', () => {
    expect(getInstallerTool.name).toBe('getInstaller');
    expect(getInstallerTool.description).not.toMatch(/notariz/i);
    expect(getInstallerTool.description).toMatch(/not code-signed yet/);
    expect(getInstallerTool.description).toMatch(/launched a token/);
  });

  it('has valid inputSchema with optional platform enum and an optional wallet', () => {
    const schema = getInstallerTool.inputSchema;
    expect(schema.type).toBe('object');
    expect(schema.properties.platform.enum).toEqual(['macOS', 'windows', 'linux']);
    expect(schema.properties.wallet.type).toBe('string');
    expect(schema.required).toBeUndefined();
  });
});

describe('before a launch (locked)', () => {
  it('returns no URL and no installer fields at all without a wallet, and says where to start', async () => {
    const result = (await getInstallerTool.execute({ platform: 'windows' })) as Result;
    const installer = result.installer as Result;
    expect(installer.status).toBe('locked');
    expect(installer.download_url).toBeNull();
    expect(installer.format).toBeNull();
    expect(installer.version).toBeNull();
    const required = result.launch_required as Result;
    expect(required.reason).toBe('no_wallet');
    expect(required.message).toMatch(/launched a token/);
    expect(required.launchpad_url).toMatch(/^https:\/\//);
    expect(JSON.stringify(result)).not.toMatch(/\.exe|releases\.example\.test/);
    expect(tracker.fetchLaunchesByWallet).not.toHaveBeenCalled();
  });

  it('returns no URL for a wallet the tracker lists no launch for', async () => {
    tracker.fetchLaunchesByWallet.mockResolvedValue([]);
    const result = (await getInstallerTool.execute({ platform: 'windows', wallet: WALLET })) as Result;
    expect((result.installer as Result).status).toBe('locked');
    expect((result.installer as Result).download_url).toBeNull();
    expect((result.launch_required as Result).reason).toBe('no_launch');
    expect(JSON.stringify(result)).not.toMatch(/\.exe/);
    expect(tracker.fetchLaunchesByWallet).toHaveBeenCalledWith(WALLET);
  });

  it('returns no URL when the tracker cannot be asked', async () => {
    tracker.fetchLaunchesByWallet.mockRejectedValue(new Error('down'));
    const result = (await getInstallerTool.execute({ platform: 'windows', wallet: WALLET })) as Result;
    expect((result.installer as Result).status).toBe('locked');
    expect((result.launch_required as Result).reason).toBe('tracker_unreachable');
    expect(JSON.stringify(result)).not.toMatch(/\.exe/);
  });

  it('treats a blank wallet as no wallet', async () => {
    const result = (await getInstallerTool.execute({ platform: 'windows', wallet: '   ' })) as Result;
    expect((result.launch_required as Result).reason).toBe('no_wallet');
    expect(tracker.fetchLaunchesByWallet).not.toHaveBeenCalled();
  });

  it('keeps the placeholder copy free of em and en dashes', async () => {
    const result = (await getInstallerTool.execute({})) as Result;
    expect(JSON.stringify(result.launch_required)).not.toMatch(/[–—]/);
  });
});

describe('after a launch (unlocked)', () => {
  it('returns the manifest-backed Windows .exe', async () => {
    const result = (await getInstallerTool.execute(LAUNCHED)) as Result;
    const installer = result.installer as Result;
    expect(installer).toEqual({
      platform: 'windows',
      status: 'available',
      format: 'exe',
      download_url: 'https://releases.example.test/StonkAgents-Setup-0.4.0.exe',
      version: '0.4.0',
    });
    expect(result.launch_required).toBeUndefined();
    expect((result.install_steps as string[])[0]).toContain('.exe');
    expect(result.install_steps).not.toContainEqual(expect.stringMatching(/MSI/));
  });

  it('reports the Windows installer as unavailable when the manifest names none, never a guessed URL', async () => {
    manifest.windowsUrl = undefined;
    const result = (await getInstallerTool.execute(LAUNCHED)) as Result;
    const installer = result.installer as Result;
    expect(installer.status).toBe('unavailable');
    expect(installer.download_url).toBeNull();
  });

  it('macOS is coming soon: no DMG, no URL', async () => {
    const result = (await getInstallerTool.execute({ ...LAUNCHED, platform: 'macOS' })) as Result;
    const installer = result.installer as Result;
    expect(installer.status).toBe('coming_soon');
    expect(installer.download_url).toBeNull();
    expect(installer.format).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/\.dmg|notariz/i);
    expect(result.uninstall).toEqual({});
  });

  it('auto-detects a platform when none is given', async () => {
    const result = (await getInstallerTool.execute({ wallet: WALLET })) as Result;
    const installer = result.installer as Result;
    expect(['macOS', 'windows', 'linux']).toContain(installer.platform);
  });

  it('includes trust signals with company info and an unsigned Windows installer', async () => {
    const result = (await getInstallerTool.execute(LAUNCHED)) as Result;
    const trust = result.trust as Result;
    const company = trust.company as Result;
    expect(company.legal_name).toBe('Tevaera Labs LLC');
    expect(company.dba).toBe('StonkAgents');
    const signing = trust.code_signing as Result;
    const windows = signing.windows as Result;
    expect(windows.authenticode_signed).toBe(false);
    expect(windows.publisher).toBeNull();
    expect(windows.smartscreen).toMatch(/unknown publisher/i);
    expect(signing).not.toHaveProperty('macOS');
  });

  it('walks the user through the unsigned-installer warning instead of promising a signature', async () => {
    const result = (await getInstallerTool.execute(LAUNCHED)) as Result;
    const steps = result.install_steps as string[];
    expect(steps.join(' ')).toMatch(/Run anyway/);
    expect(steps.join(' ')).not.toMatch(/confirm it is signed/);
  });

  it('includes safety analysis, SLOs and Windows uninstall steps', async () => {
    const result = (await getInstallerTool.execute(LAUNCHED)) as Result;
    expect((result.safety_analysis as Result).admin_required).toBe(false);
    expect((result.performance_slos as Result).install_time).toContain('45 seconds');
    const uninstall = (result.uninstall as Result).windows as Result;
    expect(uninstall.time).toBe('Under 1 minute');
    expect(uninstall.steps).toBeDefined();
  });

  it('points the access block at the launchpad, not the releases host', async () => {
    const result = (await getInstallerTool.execute(LAUNCHED)) as Result;
    const access = result.access as Result;
    expect(access.install_url).not.toMatch(/releases/);
    expect(access.message).toMatch(/launchpad/i);
  });
});
