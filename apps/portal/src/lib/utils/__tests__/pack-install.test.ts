/**
 * Purpose: The words and the small decisions the pack surfaces share: what an
 *          item says it wants (shown, never run), which items an agent is missing,
 *          and what a removal deletes.
 */
import { describe, it, expect } from 'vitest';
import type { InstalledPackItem, PackInstallResult } from '@/lib/api/daemon-packs';
import {
  installedById,
  missingItemIds,
  packDestinationLine,
  packRemovalSentence,
  packStatusLabel,
  packWantsLines,
  packWroteSomething,
  resultsById,
} from '../pack-install';

function installedItem(over: Partial<InstalledPackItem> = {}): InstalledPackItem {
  return {
    id: 'network-basics',
    name: 'network-basics',
    type: 'claw-memory',
    pack: 'starter-pack',
    version: '1.0.0',
    title: 'How the network works',
    description: '',
    cid: 'bafkrei1',
    sha256: 'abc',
    installedAt: '2026-09-23T09:03:43Z',
    paths: ['skills/network-basics/SKILL.md', 'skills/network-basics/reference/glossary.md'],
    wants: null,
    ...over,
  };
}

function result(over: Partial<PackInstallResult> = {}): PackInstallResult {
  return {
    id: 'network-basics',
    name: 'network-basics',
    type: 'claw-memory',
    pack: 'starter-pack',
    version: '1.0.0',
    cid: 'bafkrei1',
    status: 'installed',
    code: '',
    message: 'installed',
    path: 'skills/network-basics',
    files: 2,
    bytes: 100,
    touches: '',
    wants: null,
    ...over,
  };
}

describe('packWantsLines', () => {
  it('says what an item wants and that nothing runs it', () => {
    const lines = packWantsLines({ bins: ['gh'], os: ['darwin'], installHooks: true });
    expect(lines[0]).toBe('Wants the program gh on the machine. We do not install it or run it.');
    expect(lines[1]).toBe('Written for macOS.');
    expect(lines[2]).toBe('Declares an install step. Installing it here does not run that step.');
  });

  it('lists several programs and operating systems in one sentence each', () => {
    const lines = packWantsLines({ bins: ['gh', 'jq', 'curl'], os: ['darwin', 'linux'], installHooks: false });
    expect(lines[0]).toContain('gh, jq and curl');
    expect(lines[1]).toBe('Written for macOS and Linux.');
    expect(lines).toHaveLength(2);
  });

  it('says nothing for an item that asks for nothing', () => {
    expect(packWantsLines({ bins: [], os: [], installHooks: false })).toEqual([]);
    expect(packWantsLines(null)).toEqual([]);
  });
});

describe('what the agent already has', () => {
  it('offers only the items that are missing', () => {
    const installed = installedById([installedItem()]);
    expect(missingItemIds(['network-basics', 'daemon-api'], installed)).toEqual(['daemon-api']);
    expect(missingItemIds(['network-basics'], installed)).toEqual([]);
  });

  it('keeps the outcome of each row under its own id', () => {
    const map = resultsById([result(), result({ id: 'daemon-api', status: 'refused', code: 'NAME_IN_USE' })]);
    expect(map.get('daemon-api')?.status).toBe('refused');
    expect(map.get('missing')).toBeUndefined();
  });

  it('reloads the installed list only when something was written', () => {
    expect(packWroteSomething([result({ status: 'already_installed' })])).toBe(false);
    expect(packWroteSomething([result({ status: 'refused' })])).toBe(false);
    expect(packWroteSomething([result({ status: 'refused' }), result({ status: 'replaced' })])).toBe(true);
  });
});

describe('what a person is told', () => {
  it('names every outcome', () => {
    expect(packStatusLabel('installed')).toBe('Installed');
    expect(packStatusLabel('replaced')).toBe('Replaced');
    expect(packStatusLabel('already_installed')).toBe('Already installed');
    expect(packStatusLabel('refused')).toBe('Not installed');
    expect(packStatusLabel('failed')).toBe('Failed');
  });

  it('says where the files land, and says nothing before the agent has said', () => {
    expect(
      packDestinationLine({
        dir: 'C:\\me\\.openclaw',
        skillsDir: 'C:\\me\\.openclaw\\skills',
        source: 'home',
        home: '',
        exists: true,
        note: '',
      }),
    ).toBe('Files land in C:\\me\\.openclaw\\skills');
    expect(packDestinationLine(null)).toBe('');
  });

  it('counts the files a removal deletes and promises the rest is left alone', () => {
    expect(packRemovalSentence(installedItem())).toBe(
      'This deletes the 2 files your agent wrote for network-basics. Anything you added to that folder yourself is left alone.',
    );
    expect(packRemovalSentence(installedItem({ paths: ['skills/daemon-api/SKILL.md'] }))).toContain('the 1 file your agent wrote');
  });
});
