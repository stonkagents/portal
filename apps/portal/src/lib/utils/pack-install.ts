/**
 * Purpose: The words and the small decisions the pack install surfaces share:
 *          what an outcome is called, what an item says it wants, and which
 *          catalog items an agent already has. Pure, so every state is testable
 *          without a daemon.
 *
 * The rule the copy follows: a pack gives an agent written knowledge. It does
 * not upgrade, power up or teach anything. What an item declares that it wants
 * is shown; none of it is run.
 */

import type { InstalledPackItem, PackInstallResult, PackItemStatus, PackStateDir, PackWants } from '@/lib/api/daemon-packs';

/**
 * What an install control may do right now:
 * - `ready`: the agent is there and its state directory is there.
 * - `blocked`: the agent is there but cannot install yet (the command tools are
 *   finishing, the build predates packs, the loopback call failed). The control
 *   is shown and disabled, because the reason is temporary and worth reading.
 * - `unavailable`: no agent at all. Nothing is shown; a notice points at the
 *   install page instead, so there is no dead button.
 */
export type PackInstallMode = 'ready' | 'blocked' | 'unavailable';

/** The one sentence every install surface carries, before anything is written. */
export const PACK_NOTHING_RUNS = 'A pack writes text files your agent can read. Nothing in it is run.';

/** Said when the agent is not reachable. The install happens on the agent, so there is nothing to click. */
export const PACK_AGENT_OFFLINE = 'Packs install onto your agent, so it has to be running.';

/** Said when the running agent predates the install path and answers 404 for it. */
export const PACK_UNSUPPORTED = 'This agent cannot install packs yet. Update it from Settings, and the packs here can be installed.';

/** Said while the command tools step is still finishing (up to ten minutes after setup). */
export const PACK_NOT_READY =
  'Your agent is still setting up its command tools, so the folder a pack writes into is not there yet. Nothing has been written. Try again in a few minutes.';

const STATUS_LABELS: Readonly<Record<PackItemStatus, string>> = {
  installed: 'Installed',
  replaced: 'Replaced',
  already_installed: 'Already installed',
  refused: 'Not installed',
  failed: 'Failed',
};

/** What a row's outcome is called. The daemon's own message says why; this is only the chip. */
export function packStatusLabel(status: PackItemStatus): string {
  return STATUS_LABELS[status];
}

const STATUS_TONES: Readonly<Record<PackItemStatus, string>> = {
  installed: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  replaced: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  already_installed: 'border-border-default bg-bg-tertiary text-text-secondary',
  refused: 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow',
  failed: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
};

/** Border, background and text for an outcome chip, in the gallery's own tokens. */
export function packStatusTone(status: PackItemStatus): string {
  return STATUS_TONES[status];
}

/** A row that changed something on disk. Used to decide whether to reload the installed list. */
export function packWroteSomething(results: PackInstallResult[]): boolean {
  return results.some(r => r.status === 'installed' || r.status === 'replaced');
}

/** Operating system names as a person writes them; anything else passes through. */
const OS_NAMES: Readonly<Record<string, string>> = {
  darwin: 'macOS',
  macos: 'macOS',
  win32: 'Windows',
  windows: 'Windows',
  linux: 'Linux',
};

function listSentence(values: string[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * What the item says it wants of the machine, one plain sentence each. The
 * daemon reads these out of the bundle and reports them; nothing acts on them,
 * so every sentence says so.
 */
export function packWantsLines(wants: PackWants | null | undefined): string[] {
  if (!wants) return [];
  const lines: string[] = [];
  if (wants.bins.length === 1) {
    lines.push(`Wants the program ${wants.bins[0]} on the machine. We do not install it or run it.`);
  } else if (wants.bins.length > 1) {
    lines.push(`Wants these programs on the machine: ${listSentence(wants.bins)}. We do not install them or run them.`);
  }
  if (wants.os.length > 0) {
    lines.push(`Written for ${listSentence(wants.os.map(os => OS_NAMES[os.toLowerCase()] ?? os))}.`);
  }
  if (wants.installHooks) {
    lines.push('Declares an install step. Installing it here does not run that step.');
  }
  return lines;
}

/** Where the files land, for a person to read before agreeing. Empty while the agent has not said. */
export function packDestinationLine(stateDir: PackStateDir | null | undefined): string {
  if (!stateDir?.skillsDir) return '';
  return `Files land in ${stateDir.skillsDir}`;
}

/** Installed rows by item id, for marking a catalog item as something the agent already has. */
export function installedById(items: InstalledPackItem[] | undefined): Map<string, InstalledPackItem> {
  return new Map((items ?? []).map(item => [item.id, item]));
}

/** The results of the last install attempt by item id, so each row keeps its own outcome. */
export function resultsById(results: PackInstallResult[] | undefined): Map<string, PackInstallResult> {
  return new Map((results ?? []).map(result => [result.id, result]));
}

/**
 * The catalog items of a pack that the agent does not have yet. An install
 * offers only these, so nobody is asked to install what they already have.
 */
export function missingItemIds(itemIds: string[], installed: Map<string, InstalledPackItem>): string[] {
  return itemIds.filter(id => !installed.has(id));
}

/** How many files a removal deletes, said plainly for the confirmation. */
export function packRemovalSentence(item: InstalledPackItem): string {
  const count = item.paths.length;
  const files = count === 1 ? '1 file' : `${count} files`;
  return `This deletes the ${files} your agent wrote for ${item.name}. Anything you added to that folder yourself is left alone.`;
}
