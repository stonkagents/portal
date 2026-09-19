/**
 * Purpose: The plain-text sharing rule, stated once for the share UI, the client-side check
 *          and the daemon client. Agents share knowledge, so only plain-text files can be shared.
 *          Mirrors the agent repository internal/sharing (extension allowlist; the daemon also sniffs content).
 */

/** Extensions the daemon accepts at POST /api/v1/share (lowercase, with the dot). No .env: secrets. */
export const SHARE_ALLOWED_EXTENSIONS: readonly string[] = [
  // Plain text and data
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.csv',
  '.tsv',
  '.toml',
  '.xml',
  '.html',
  '.htm',
  '.log',
  '.rst',
  '.ini',
  '.cfg',
  '.conf',
  // Source code
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.sh',
  '.ps1',
  '.sql',
  '.css',
  '.scss',
  '.rb',
  '.php',
  '.kt',
  '.swift',
  '.lua',
];

/** Value for the file input's `accept` attribute. */
export const SHARE_ACCEPT = SHARE_ALLOWED_EXTENSIONS.join(',');

/** The one sentence the user sees whenever a file is refused, and in the share UI's helper text. */
export const SHARE_RULE_MESSAGE = 'Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).';

/** Error code the daemon (415) and the tracker (400) return for a refused file. */
export const UNSUPPORTED_FILE_TYPE_CODE = 'UNSUPPORTED_FILE_TYPE';

const allowed = new Set(SHARE_ALLOWED_EXTENSIONS);

/** Lowercased extension of a filename including the dot, or '' when there is none. */
export function shareFileExtension(filename: string): string {
  const base = filename.slice(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot).toLowerCase();
}

/** True when the filename's extension is on the allowlist (case-insensitive; no extension is refused). */
export function isShareableFilename(filename: string): boolean {
  const ext = shareFileExtension(filename);
  return ext !== '' && allowed.has(ext);
}
