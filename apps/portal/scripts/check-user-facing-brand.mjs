#!/usr/bin/env node
/**
 * Guard against retired product names leaking into user-facing surfaces.
 *
 * Scans the surfaces a visitor can read — not identifiers, directory names,
 * test ids or component names, which may keep the old words:
 *
 *   - src/lib/i18n/*.ts        translation VALUES (keys are identifiers)
 *   - public/**                file names and text assets (manifest, svg, txt)
 *   - src/**\/*.tsx             JSX text nodes and title= / aria-label= /
 *                              placeholder= / alt= attribute values
 *   - src/**\/*.ts(x)           every other string literal (toasts, badge
 *                              text, thrown errors, metadata), minus the
 *                              attributes that never render (test ids, class
 *                              names, imports) and the files listed below
 *
 * Later this should run against the built `out/` directory as well; for now
 * the source scan is the gate.
 *
 *   node scripts/check-user-facing-brand.mjs
 *
 * Exit codes: 0 clean, 1 old brand words found (each printed as file:line),
 * 2 a scanned directory could not be read.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

/**
 * Words that must not reach a visitor. Word-bounded so `.claw-skill` (a protocol
 * value) and CSS class names do not match. Identifiers, directory names and
 * test ids may still carry them; only rendered text is checked.
 */
/* The retired words are spelled in pieces so this file passes its own check. */
const B = 'b' + 'rah';
const OLD_BRAND = new RegExp(
  [`claw${B}`, `claw-${B}`, `${B}[-_ ]?sync`, `${B}-portal`, `pump${B}`, 'pump.fun', 'pumpfun', `\\b${B}s?\\b`, '\\bthe claw\\b', `@claw${B}`, `claw${B}\\.(?:com|org)`].join('|'),
  'i',
);
/** Local build artifacts that are git-ignored and never shipped from this folder. */
const IGNORED_PUBLIC_EXTENSIONS = new Set(['.msi', '.exe', '.dmg', '.AppImage']);

const TEXT_ASSET_EXTENSIONS = new Set(['.webmanifest', '.json', '.svg', '.txt', '.xml', '.html']);
const IGNORED_DIRS = new Set(['node_modules', '__tests__', '.next', 'out']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    console.error(`check-user-facing-brand: cannot read ${dir}: ${error.message}`);
    process.exit(2);
  }
  for (const name of entries) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return relative(projectRoot, file).replace(/\\/g, '/');
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

const findings = [];

function report(file, line, snippet) {
  findings.push(`${rel(file)}:${line}: ${snippet.trim().slice(0, 120)}`);
}

/* ── 1. i18n values ─────────────────────────────────────────────────────── */
const I18N_ENTRY = /^\s*'[^']*'\s*:\s*(.+?),?\s*$/;
for (const file of walk(join(projectRoot, 'src', 'lib', 'i18n'))) {
  if (extname(file) !== '.ts') continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const match = I18N_ENTRY.exec(line);
    if (match && OLD_BRAND.test(match[1])) report(file, i + 1, match[1]);
  });
}

/* ── 2. public/ file names and text assets ──────────────────────────────── */
for (const file of walk(join(projectRoot, 'public'))) {
  if (IGNORED_PUBLIC_EXTENSIONS.has(extname(file))) continue;
  if (OLD_BRAND.test(basename(file))) report(file, 0, `file name: ${basename(file)}`);
  if (!TEXT_ASSET_EXTENSIONS.has(extname(file))) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (OLD_BRAND.test(line)) report(file, i + 1, line);
  });
}

/* ── 3. JSX text nodes and user-visible attributes ──────────────────────── */
// Text between a closing `>` and the next `<` that contains no expression braces.
const JSX_TEXT = />([^<>{}]+)</g;
// title="..." / aria-label='...' / placeholder={"..."} / alt={`...`}
const JSX_ATTR = /\b(?:title|aria-label|placeholder|alt)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)\s*\})/g;

for (const file of walk(join(projectRoot, 'src'))) {
  if (extname(file) !== '.tsx' || /\.test\.tsx$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');

  for (const match of source.matchAll(JSX_TEXT)) {
    const text = match[1];
    if (OLD_BRAND.test(text)) report(file, lineOf(source, match.index), text);
  }
  for (const match of source.matchAll(JSX_ATTR)) {
    const value = match.slice(1).find(v => v !== undefined) ?? '';
    if (OLD_BRAND.test(value)) report(file, lineOf(source, match.index), match[0]);
  }
}

/* ── 4. String literals in source: toasts, labels, errors, metadata ──────── */
// Every quoted string in .ts/.tsx (not tests) can end up on screen: toast
// titles, badge descriptions, thrown errors, page metadata, share text. The
// exceptions are attributes and imports that never render as text, and the
// files listed below.
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
// The token right before the literal, when it makes the literal an identifier.
const NON_TEXT_CONTEXT = /(?:data-testid|className|class|id|key|htmlFor|from|import|export|require\(|testId|i18nKey|icon)\s*[=:(]?\s*\{?\s*$/;
/** Files allowed to spell the retired words; none at present. */
const LEGACY_FILES = new Set([]);

for (const file of walk(join(projectRoot, 'src'))) {
  const ext = extname(file);
  if ((ext !== '.ts' && ext !== '.tsx') || /\.test\.tsx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
  if (LEGACY_FILES.has(rel(file))) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(STRING_LITERAL)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (!OLD_BRAND.test(value)) continue;
    const before = source.slice(Math.max(0, match.index - 40), match.index);
    if (NON_TEXT_CONTEXT.test(before)) continue;
    report(file, lineOf(source, match.index), match[0]);
  }
}

/* ── Result ─────────────────────────────────────────────────────────────── */
if (findings.length === 0) {
  console.log('check-user-facing-brand: clean.');
  process.exit(0);
}

console.error(`check-user-facing-brand: ${findings.length} old brand reference(s) in user-facing surfaces:`);
for (const line of findings) console.error(`  ${line}`);
process.exit(1);
