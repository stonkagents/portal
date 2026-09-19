import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* S3: one build-time version, injected as env and shown in the footer.
 * NEXT_PUBLIC_APP_VERSION comes from package.json; NEXT_PUBLIC_BUILD_ID is the
 * git short sha (a timestamp when git is unavailable). The build id is also
 * written to public/build-id.txt so a running tab can notice a newer deploy. */
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')) as { version: string };

function resolveBuildId(): string {
  if (process.env.NEXT_PUBLIC_BUILD_ID) return process.env.NEXT_PUBLIC_BUILD_ID;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return Date.now().toString(36);
  }
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? pkg.version;
const BUILD_ID = resolveBuildId();

mkdirSync(join(__dirname, 'public'), { recursive: true });
writeFileSync(join(__dirname, 'public', 'build-id.txt'), `${BUILD_ID}\n`);

const nextConfig: NextConfig = {
  output: 'export',
  /* A second dev server on the same checkout (one pointed at a QA daemon, see e2e/qa/README.md)
     must not share the build folder with the first, or each serves the other's compiled pages. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config: any) {
    // @solana/web3.js requires Buffer in the browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve('buffer/'),
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpack = require('webpack');
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      // We only use Phantom (Wallet Standard) — skip WalletConnect bundling.
      // ConnectorKit's dynamic import is wrapped in try/catch so this is safe.
      new webpack.IgnorePlugin({
        resourceRegExp: /^@walletconnect\/universal-provider$/,
      }),
    );
    return config;
  },
};

export default nextConfig;
