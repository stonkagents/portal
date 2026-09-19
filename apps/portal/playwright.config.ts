import { defineConfig, devices } from '@playwright/test';

// PERF-5 suite targets the live dev server; keep it out of the webServer-managed projects.
const PERF_SPEC = /perf-regression\.spec\.ts$/;
const PERF_BASE_URL = process.env.PERF_BASE_URL || 'http://localhost:3003';
// QA suite (e2e/qa): a local portal pointed at a throwaway daemon on dev, see e2e/qa/README.md.
// Every spec in it skips itself when no QA daemon answers, so the project is safe to select anywhere.
const QA_SPEC = /[\/]qa[\/].*\.spec\.ts$/;
const QA_BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3013';
// When only the perf or qa project is selected, never spawn the port-3000 dev server.
const { argv } = process;
const projectArg = (name: string) =>
  argv.includes(`--project=${name}`) || argv.some((a, i) => a === '--project' && argv[i + 1] === name);
const PERF_ONLY = process.env.PERF_ONLY === '1' || projectArg('perf');
const QA_ONLY = process.env.QA_ONLY === '1' || projectArg('qa');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [PERF_SPEC, QA_SPEC] },
    { name: 'mobile', use: { ...devices['iPhone 13'] }, testIgnore: [PERF_SPEC, QA_SPEC] },
    { name: 'tablet', use: { viewport: { width: 600, height: 1024 } }, testIgnore: [PERF_SPEC, QA_SPEC] },
    // PERF-5 regression suite: runs only against an already-running dev server
    // (default http://localhost:3003, override with PERF_BASE_URL). Not part of the default run.
    {
      name: 'perf',
      testMatch: PERF_SPEC,
      use: { ...devices['Desktop Chrome'], baseURL: PERF_BASE_URL, trace: 'off' },
    },
    // End-to-end hardening suite against a QA daemon (default http://localhost:3013, override with
    // QA_BASE_URL; the daemon is found through QA_DAEMON_URL). Skips itself when nothing answers.
    {
      name: 'qa',
      testMatch: QA_SPEC,
      timeout: 60_000,
      use: { ...devices['Desktop Chrome'], baseURL: QA_BASE_URL, trace: 'retain-on-failure' },
    },
  ],
  webServer:
    PERF_ONLY || QA_ONLY
      ? undefined
      : {
          command: 'npm run dev',
          port: 3000,
          reuseExistingServer: true,
          env: {
            // E2E test-safe overrides — prevent .env.local from bleeding in
            NEXT_PUBLIC_USE_MOCK_DATA: 'true',
            NEXT_PUBLIC_USE_REAL_WALLET: 'false',
            NEXT_PUBLIC_SOLANA_NETWORK: 'devnet',
            NEXT_PUBLIC_PLATFORM_FEE_SOL: '0',
          },
        },
});
