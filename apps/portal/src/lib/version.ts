/**
 * Purpose: The one place the UI's own version lives (S3).
 *
 * Both values are injected at build time by next.config.ts: APP_VERSION from
 * package.json, BUILD_ID from the git short sha (or a timestamp when git is
 * unavailable). The same BUILD_ID is written to public/build-id.txt so a
 * running tab can tell when a newer build has been deployed (UiUpdateBar).
 *
 * The agent (local daemon) keeps its own version stream; it is reported by the
 * daemon itself and never derived from these.
 */

export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';

export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

/** Deployment environment label: dev (default), staging, production. */
const APP_ENV: string = process.env.NEXT_PUBLIC_ENV ?? 'dev';

/** True on the production site only; dev and staging builds show the experimental banner. */
export const IS_PRODUCTION_ENV: boolean = APP_ENV === 'production';

/** Where a running page reads the deployed build id from. */
export const BUILD_ID_PATH = '/build-id.txt';
