#!/usr/bin/env node
/**
 * Guard for src/config/temporary.ts.
 *
 * Nothing temporary ships silently. This script parses the temporary-config
 * file and fails the production build while it exports anything at all.
 *
 *   node scripts/check-temporary.mjs            # warns outside production
 *   node scripts/check-temporary.mjs --strict   # always fails on a hit
 *   NODE_ENV=production node scripts/check-temporary.mjs
 *
 * Exit codes: 0 clean (or a non-strict warning), 1 temporary exports found,
 * 2 the file could not be read.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const targetPath = join(projectRoot, 'src', 'config', 'temporary.ts');

const strict = process.argv.includes('--strict') || process.env.NODE_ENV === 'production';

/** Strip block comments and line comments so commented-out code never counts as an export. */
function stripComments(source) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
  return withoutBlocks
    .split(/\r?\n/)
    .map(line => line.replace(/(^|[^:"'`\\])\/\/.*$/, '$1'))
    .join('\n');
}

const DECLARATION =
  /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const NAMED_LIST = /^\s*export\s*\{([^}]*)\}/;
const STAR_REEXPORT = /^\s*export\s+\*/;
const BARE_DEFAULT = /^\s*export\s+default\b/;

/**
 * Collect every export in the file with the line it sits on.
 * @returns {{ name: string, kind: string, line: number }[]}
 */
function findExports(source) {
  const lines = stripComments(source).split(/\r?\n/);
  const found = [];

  lines.forEach((text, index) => {
    const line = index + 1;

    const declared = DECLARATION.exec(text);
    if (declared) {
      found.push({ name: declared[2], kind: declared[1].replace('*', ''), line });
      return;
    }

    const named = NAMED_LIST.exec(text);
    if (named) {
      const inner = named[1].trim();
      if (inner === '') return; // `export {}` — the empty, allowed form
      for (const part of inner.split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) found.push({ name, kind: 'named', line });
      }
      return;
    }

    if (STAR_REEXPORT.test(text)) {
      found.push({ name: text.trim(), kind: 're-export', line });
      return;
    }

    if (BARE_DEFAULT.test(text)) found.push({ name: 'default', kind: 'default', line });
  });

  return found;
}

/** The nearest `// TEMP:` comment at or above the export, so the reason travels with the finding. */
function tempNoteFor(sourceLines, exportLine) {
  const own = /\/\/\s*TEMP:\s*(.*)$/i.exec(sourceLines[exportLine - 1] ?? '');
  if (own) return { line: exportLine, text: own[1].trim() };

  for (let i = exportLine - 1; i >= 1 && i > exportLine - 8; i -= 1) {
    const text = sourceLines[i - 1] ?? '';
    if (text.trim() === '') break;
    const note = /\/\/\s*TEMP:\s*(.*)$/i.exec(text);
    if (note) return { line: i, text: note[1].trim() };
    if (/\bexport\b/.test(text)) break;
  }
  return null;
}

let source;
try {
  source = readFileSync(targetPath, 'utf8');
} catch (error) {
  console.error(`check-temporary: cannot read ${relative(projectRoot, targetPath)} — ${error.message}`);
  process.exit(2);
}

const exports = findExports(source);
const rel = relative(projectRoot, targetPath).replace(/\\/g, '/');

if (exports.length === 0) {
  console.log(`check-temporary: ${rel} is clean.`);
  process.exit(0);
}

const sourceLines = source.split(/\r?\n/);
const label = strict ? 'ERROR' : 'WARNING';
console.error(`\ncheck-temporary: ${label} — ${exports.length} temporary export(s) in ${rel}\n`);

for (const item of exports) {
  const note = tempNoteFor(sourceLines, item.line);
  console.error(`  ${rel}:${item.line}  ${item.kind} ${item.name}`);
  console.error(note ? `    // TEMP: ${note.text}` : '    (no // TEMP: comment — add one stating why and what replaces it)');
}

if (strict) {
  console.error(`\nTemporary hard-codes may not ship. Empty ${rel} back to \`export {}\` before building.\n`);
  process.exit(1);
}

console.error(`\nAllowed outside production. This will fail the build with NODE_ENV=production or --strict.\n`);
process.exit(0);
