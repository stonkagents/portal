/**
 * Feature: StonkAgents rebrand
 * Purpose: Display labels for asset type extensions.
 *
 *          The `.claw-*` extensions are protocol values: the daemon and tracker
 *          store and filter on them, so the values themselves must not change here.
 *          Only what the user reads changes.
 */

const ASSET_TYPE_LABELS: Readonly<Record<string, string>> = {
  '.claw-skill': '.agent-skill',
  '.claw-prompt': '.agent-prompt',
  '.claw-memory': '.agent-memory',
  '.claw-workflow': '.agent-workflow',
  '.claw-tool': '.agent-tool',
  '.claw-context': '.agent-context',
};

/**
 * Map a protocol asset type to the label shown to users.
 * Unknown types pass through unchanged.
 */
export function assetTypeLabel(type: string): string {
  return ASSET_TYPE_LABELS[type] ?? type;
}
