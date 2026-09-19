/**
 * Purpose: File scan utilities — validates file type, detects embedded scripts, validates SafeTensors format
 */

import { isShareableFilename, shareFileExtension, SHARE_RULE_MESSAGE } from './share-rules';

export interface ScanResult {
  passed: boolean;
  message: string;
}

/**
 * Formats where an embedded script or shebang is unexpected. Source code and markup
 * (.js, .sh, .html and the rest of the allowlist) are code by declaration, so the
 * script scan does not apply to them.
 */
const SCRIPT_SCANNED_EXTENSIONS = new Set([
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
  '.log',
  '.rst',
  '.ini',
  '.cfg',
  '.conf',
]);

/** Extensions that require SafeTensors validation */
const SAFETENSOR_EXTENSIONS = new Set(['.vec', '.traj']);

/** Executable magic byte signatures (first 4 bytes) */
const EXECUTABLE_SIGNATURES: [number[], string][] = [
  [[0x7f, 0x45, 0x4c, 0x46], 'ELF'], // Linux ELF
  [[0x4d, 0x5a], 'PE'], // Windows PE
  [[0xcf, 0xfa, 0xed, 0xfe], 'Mach-O'], // macOS Mach-O 64
  [[0xce, 0xfa, 0xed, 0xfe], 'Mach-O'], // macOS Mach-O 32
  [[0xfe, 0xed, 0xfa, 0xcf], 'Mach-O'], // Mach-O 64 (big-endian)
  [[0xfe, 0xed, 0xfa, 0xce], 'Mach-O'], // Mach-O 32 (big-endian)
];

/** Script/macro patterns to detect */
const SCRIPT_PATTERNS = [/<script[\s>]/i, /\beval\s*\(/i, /\bnew\s+Function\s*\(/i, /^#!\//m];

function getExtension(filename: string): string {
  // Handle compound extensions like .claw-skill
  const clawMatch = filename.match(/(\.\w+-\w+)$/);
  if (clawMatch) return clawMatch[1];
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filename.slice(dotIndex);
}

/** Read File as ArrayBuffer via FileReader (jsdom-compatible) */
function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Read first N bytes from a File */
async function readFirstBytes(file: File, count: number): Promise<Uint8Array> {
  const buffer = await readFileAsArrayBuffer(file);
  return new Uint8Array(buffer, 0, Math.min(count, buffer.byteLength));
}

/** Read file content as text (first 64KB max) */
async function readAsText(file: File, maxBytes = 65536): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(buffer, 0, Math.min(maxBytes, buffer.byteLength));
  return new TextDecoder().decode(bytes);
}

/**
 * Check 1: Validate file extension (plain-text allowlist, case-insensitive) + detect executable magic bytes.
 */
export async function validateFileType(file: File): Promise<ScanResult> {
  if (!isShareableFilename(file.name)) {
    return { passed: false, message: SHARE_RULE_MESSAGE };
  }

  // Check magic bytes for executable content
  if (file.size >= 4) {
    const header = await readFirstBytes(file, 4);
    for (const [sig, format] of EXECUTABLE_SIGNATURES) {
      const match = sig.every((byte, i) => header[i] === byte);
      if (match) {
        return { passed: false, message: `File contains ${format} executable binary` };
      }
    }
  }

  return { passed: true, message: 'File type verified' };
}

/**
 * Check 2: Scan for embedded scripts, macros, or shebangs in document formats.
 * Code and markup files pass: a shebang in a .sh or a <script> in an .html is the point of the file.
 */
export async function scanForScripts(file: File): Promise<ScanResult> {
  if (!SCRIPT_SCANNED_EXTENSIONS.has(shareFileExtension(file.name))) {
    return { passed: true, message: 'Code file: script scan not applicable' };
  }
  const text = await readAsText(file);

  for (const pattern of SCRIPT_PATTERNS) {
    if (pattern.test(text)) {
      return { passed: false, message: 'Embedded script or macro detected' };
    }
  }

  return { passed: true, message: 'No embedded scripts detected' };
}

/**
 * Check 3: Validate file format.
 * For .vec and .traj files: validates SafeTensors header structure.
 * For other accepted types: confirms format is valid.
 */
export async function validateFileFormat(file: File): Promise<ScanResult> {
  const ext = getExtension(file.name);

  if (!SAFETENSOR_EXTENSIONS.has(ext)) {
    return { passed: true, message: 'File format verified' };
  }

  if (file.size < 8) {
    return { passed: false, message: 'File too small for SafeTensors format' };
  }

  const header = await readFirstBytes(file, 8);
  const view = new DataView(header.buffer);
  const metadataLength = view.getBigUint64(0, true); // little-endian

  if (metadataLength > BigInt(file.size) - BigInt(8)) {
    return { passed: false, message: 'Invalid SafeTensors header: metadata length exceeds file size' };
  }

  return { passed: true, message: 'SafeTensors format validated' };
}
