#!/usr/bin/env node
/**
 * Copy the tracker's contract fixtures into the portal.
 *
 * The tracker generates canonical JSON responses from its real handlers into
 * agent/tracker/testdata/contracts/*.json. The portal keeps a copy under
 * src/lib/api/__fixtures__/tracker/ and runs every file through its own
 * parsers in src/lib/api/__tests__/tracker-contracts.test.ts, so a shape
 * change on either side fails the suite instead of a live page.
 *
 *   npm run contracts:sync                       # from ../../../agent
 *   CONTRACTS_DIR=/path/to/contracts npm run contracts:sync
 *
 * Exit codes: 0 copied, 1 the source directory is missing or holds no JSON.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const source = resolve(process.env.CONTRACTS_DIR ?? join(projectRoot, '..', '..', '..', 'agent', 'tracker', 'testdata', 'contracts'));
const target = join(projectRoot, 'src', 'lib', 'api', '__fixtures__', 'tracker');

if (!existsSync(source)) {
  console.error(`contracts:sync: no such directory: ${source}`);
  console.error('Generate the fixtures in the agent repository first, or point CONTRACTS_DIR at them.');
  process.exit(1);
}

const files = readdirSync(source).filter(name => name.endsWith('.json'));
if (files.length === 0) {
  console.error(`contracts:sync: no *.json fixtures in ${source}`);
  process.exit(1);
}

/* The copy is the whole set: a fixture the tracker dropped must not linger here. */
mkdirSync(target, { recursive: true });
for (const stale of readdirSync(target).filter(name => name.endsWith('.json') && !files.includes(name))) {
  rmSync(join(target, stale));
  console.log(`removed ${relative(projectRoot, join(target, stale))}`);
}
for (const name of files) {
  copyFileSync(join(source, name), join(target, name));
  console.log(`copied  ${name}`);
}
console.log(`contracts:sync: ${files.length} fixture(s) → ${relative(projectRoot, target)}`);
