/**
 * Ensures @coral-xyz/anchor can resolve eventemitter3 (bundler expects it nested).
 * Run after npm install so ENOENT on anchor/node_modules/eventemitter3 does not occur.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const anchorDir = path.join(root, 'node_modules', '@coral-xyz', 'anchor', 'node_modules');
const source = path.join(root, 'node_modules', 'eventemitter3');
const dest = path.join(anchorDir, 'eventemitter3');

if (!fs.existsSync(source)) return;
if (fs.existsSync(path.join(dest, 'index.js'))) return;

try {
  if (!fs.existsSync(anchorDir)) fs.mkdirSync(anchorDir, { recursive: true });
  fs.cpSync(source, dest, { recursive: true });
  console.log('[postinstall] Ensured @coral-xyz/anchor/node_modules/eventemitter3');
} catch (err) {
  console.warn('[postinstall] Could not ensure anchor eventemitter3:', err.message);
}
