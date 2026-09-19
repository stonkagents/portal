/**
 * Purpose: Tests for share-rules: the plain-text allowlist, the accept string and the rule sentence.
 */
import { describe, test, expect } from 'vitest';
import {
  isShareableFilename,
  shareFileExtension,
  SHARE_ACCEPT,
  SHARE_ALLOWED_EXTENSIONS,
  SHARE_RULE_MESSAGE,
  UNSUPPORTED_FILE_TYPE_CODE,
} from '../share-rules';

describe('isShareableFilename', () => {
  test('allows plain-text, data and code extensions', () => {
    for (const name of [
      'notes.txt',
      'README.md',
      'guide.markdown',
      'data.json',
      'rows.jsonl',
      'config.yaml',
      'config.yml',
      'table.csv',
      'table.tsv',
      'Cargo.toml',
      'feed.xml',
      'page.html',
      'daemon.log',
      'settings.ini',
      'main.js',
      'main.ts',
      'App.tsx',
      'script.py',
      'main.go',
      'lib.rs',
      'run.sh',
      'run.ps1',
      'schema.sql',
      'style.css',
    ]) {
      expect(isShareableFilename(name), name).toBe(true);
    }
  });

  test('is case-insensitive on the extension', () => {
    for (const name of ['NOTES.TXT', 'Readme.MD', 'Data.JSON', 'Script.PY']) {
      expect(isShareableFilename(name), name).toBe(true);
    }
  });

  test('refuses binaries, images, archives, documents and executables', () => {
    for (const name of [
      'model.safetensors',
      'weights.bin',
      'emb.npy',
      'photo.png',
      'photo.JPG',
      'clip.mp4',
      'archive.zip',
      'archive.tar.gz',
      'paper.pdf',
      'deck.pptx',
      'doc.docx',
      'setup.exe',
      'image.svg',
      'skill.claw-skill',
    ]) {
      expect(isShareableFilename(name), name).toBe(false);
    }
  });

  test('refuses .env-style files and files with no extension', () => {
    for (const name of ['.env', '.env.local', 'prod.env', 'README', 'passwd', '', '.']) {
      expect(isShareableFilename(name), name).toBe(false);
    }
  });

  test('uses only the base name when a path is given', () => {
    expect(isShareableFilename('dir/sub/notes.txt')).toBe(true);
    expect(isShareableFilename('dir.txt/binary')).toBe(false);
    expect(isShareableFilename('D:\\home\\notes.md')).toBe(true);
  });
});

describe('shareFileExtension', () => {
  test('returns the lowercased extension with the dot', () => {
    expect(shareFileExtension('Notes.TXT')).toBe('.txt');
    expect(shareFileExtension('archive.tar.gz')).toBe('.gz');
  });

  test('returns an empty string when there is no extension', () => {
    expect(shareFileExtension('README')).toBe('');
    expect(shareFileExtension('.env')).toBe('');
  });
});

describe('constants', () => {
  test('SHARE_ACCEPT lists every allowed extension for the file input', () => {
    const parts = SHARE_ACCEPT.split(',');
    expect(parts).toEqual([...SHARE_ALLOWED_EXTENSIONS]);
    for (const p of parts) expect(p.startsWith('.')).toBe(true);
    expect(parts).not.toContain('.env');
  });

  test('the rule sentence and error code match the daemon contract', () => {
    expect(SHARE_RULE_MESSAGE).toBe('Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).');
    expect(UNSUPPORTED_FILE_TYPE_CODE).toBe('UNSUPPORTED_FILE_TYPE');
  });
});
