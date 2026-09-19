/**
 * Purpose: Tests for file-scan utility — validates file type, detects scripts, validates SafeTensors format
 */
import { describe, test, expect } from 'vitest';
import { validateFileType, scanForScripts, validateFileFormat } from '../file-scan';

// Helper: create File with specific byte content
function fileWithBytes(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
}

function textFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('validateFileType', () => {
  test('passes for .md files', async () => {
    const result = await validateFileType(textFile('readme.md', 'data'));
    expect(result.passed).toBe(true);
  });

  test('passes for .json files', async () => {
    const result = await validateFileType(textFile('data.json', '{"ok":true}'));
    expect(result.passed).toBe(true);
  });

  test('passes for .txt files', async () => {
    const result = await validateFileType(textFile('notes.txt', 'data'));
    expect(result.passed).toBe(true);
  });

  test('passes for .xml files', async () => {
    const result = await validateFileType(textFile('doc.xml', '<ok />'));
    expect(result.passed).toBe(true);
  });

  test('fails for .exe files', async () => {
    const result = await validateFileType(textFile('malware.exe', 'data'));
    expect(result.passed).toBe(false);
    expect(result.message).toBe('Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).');
  });

  test('passes for code files such as .sh and .py', async () => {
    expect((await validateFileType(textFile('script.sh', '#!/bin/sh\necho hi'))).passed).toBe(true);
    expect((await validateFileType(textFile('tool.py', 'print(1)'))).passed).toBe(true);
  });

  test('passes for uppercase extensions', async () => {
    const result = await validateFileType(textFile('NOTES.TXT', 'data'));
    expect(result.passed).toBe(true);
  });

  test('fails for images, archives, PDFs and .env files', async () => {
    for (const name of ['photo.png', 'archive.zip', 'paper.pdf', '.env', 'prod.env']) {
      const result = await validateFileType(textFile(name, 'data'));
      expect(result.passed, name).toBe(false);
      expect(result.message).toMatch(/only plain-text files can be shared/i);
    }
  });

  test('fails for legacy .vec files', async () => {
    const result = await validateFileType(textFile('embeddings.vec', 'data'));
    expect(result.passed).toBe(false);
  });

  test('fails for files with no extension', async () => {
    const result = await validateFileType(textFile('noextension', 'data'));
    expect(result.passed).toBe(false);
  });

  test('detects ELF executable magic bytes even with valid extension', async () => {
    // ELF magic: 0x7f 'E' 'L' 'F'
    const result = await validateFileType(fileWithBytes('hidden.txt', [0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00]));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/executable/i);
  });

  test('detects PE (Windows) executable magic bytes', async () => {
    // PE magic: 'M' 'Z'
    const result = await validateFileType(fileWithBytes('hidden.txt', [0x4d, 0x5a, 0x00, 0x00]));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/executable/i);
  });

  test('detects Mach-O executable magic bytes', async () => {
    // Mach-O 64-bit: 0xCF 0xFA 0xED 0xFE
    const result = await validateFileType(fileWithBytes('hidden.txt', [0xcf, 0xfa, 0xed, 0xfe]));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/executable/i);
  });

  test('passes for valid extension with normal content', async () => {
    const result = await validateFileType(fileWithBytes('good.txt', [0x01, 0x02, 0x03, 0x04]));
    expect(result.passed).toBe(true);
  });
});

describe('scanForScripts', () => {
  test('passes for clean text content', async () => {
    const result = await scanForScripts(textFile('clean.txt', 'This is a clean text file'));
    expect(result.passed).toBe(true);
  });

  test('detects <script> tags', async () => {
    const result = await scanForScripts(textFile('xss.txt', 'Hello <script>alert("xss")</script>'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/script/i);
  });

  test('detects eval() calls', async () => {
    const result = await scanForScripts(textFile('eval.txt', 'const x = eval("malicious code")'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/script/i);
  });

  test('detects Function() constructor', async () => {
    const result = await scanForScripts(textFile('func.txt', 'new Function("return this")'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/script/i);
  });

  test('detects shebang lines', async () => {
    const result = await scanForScripts(textFile('shell.txt', '#!/bin/bash\nrm -rf /'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/script/i);
  });

  test('passes for binary files without script patterns', async () => {
    const result = await scanForScripts(fileWithBytes('clean.vec', [0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]));
    expect(result.passed).toBe(true);
  });

  test('is case-insensitive for script detection', async () => {
    const result = await scanForScripts(textFile('upper.txt', '<SCRIPT>alert(1)</SCRIPT>'));
    expect(result.passed).toBe(false);
  });

  test('does not apply to code and markup files', async () => {
    expect((await scanForScripts(textFile('run.sh', '#!/bin/bash\necho ok'))).passed).toBe(true);
    expect((await scanForScripts(textFile('app.js', 'eval("1+1")'))).passed).toBe(true);
    expect((await scanForScripts(textFile('page.html', '<script>init()</script>'))).passed).toBe(true);
  });
});

describe('validateFileFormat', () => {
  test('passes for files with valid SafeTensors header (.vec)', async () => {
    const header = new Uint8Array(40);
    const view = new DataView(header.buffer);
    view.setBigUint64(0, BigInt(24), true);
    const result = await validateFileFormat(new File([header], 'model.vec'));
    expect(result.passed).toBe(true);
  });

  test('fails when metadata length exceeds file size (.vec)', async () => {
    const header = new Uint8Array(16);
    const view = new DataView(header.buffer);
    view.setBigUint64(0, BigInt(999999), true);
    const result = await validateFileFormat(new File([header], 'bad.vec'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/invalid/i);
  });

  test('fails for .vec files too small to have SafeTensors header', async () => {
    const result = await validateFileFormat(fileWithBytes('tiny.vec', [0x01, 0x02]));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/too small/i);
  });

  test('passes for non-SafeTensors types with verified message', async () => {
    const result = await validateFileFormat(textFile('prompt.txt', 'hello'));
    expect(result.passed).toBe(true);
    expect(result.message).toMatch(/verified/i);
  });

  test('validates SafeTensors header for .traj files', async () => {
    const header = new Uint8Array(40);
    const view = new DataView(header.buffer);
    view.setBigUint64(0, BigInt(24), true);
    const result = await validateFileFormat(new File([header], 'traj.traj'));
    expect(result.passed).toBe(true);
  });
});
