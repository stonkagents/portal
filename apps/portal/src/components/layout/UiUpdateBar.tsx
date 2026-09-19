/**
 * Purpose: "A new version is available" bar for the UI itself (S3).
 *
 * The static export ships its build id in public/build-id.txt. On tab focus
 * and every 10 minutes the running page fetches it and, when it differs from
 * the id this bundle was built with, offers a reload. Never reloads on its
 * own: a launch or a chat in progress must not be interrupted.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { BUILD_ID, BUILD_ID_PATH } from '@/lib/version';

export const UI_UPDATE_CHECK_MS = 10 * 60 * 1000;

/** Fetch the deployed build id; null when the file is missing or unreachable. */
export async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const res = await fetch(BUILD_ID_PATH, { cache: 'no-store', headers: { Accept: 'text/plain' } });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    /* A missing file on an SPA host answers with the app shell; a build id is one short token. */
    if (!text || text.length > 64 || /[<>\s]/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export function UiUpdateBar({ currentBuildId = BUILD_ID }: { currentBuildId?: string }) {
  const [newer, setNewer] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!currentBuildId) return;
    const deployed = await fetchDeployedBuildId();
    if (deployed && deployed !== currentBuildId) setNewer(deployed);
  }, [currentBuildId]);

  useEffect(() => {
    if (!currentBuildId) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(() => void check(), UI_UPDATE_CHECK_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(timer);
    };
  }, [check, currentBuildId]);

  if (!newer) return null;

  return (
    <div
      className="w-full border-b border-accent-green/40 bg-bg-secondary px-4 py-2"
      role="status"
      data-testid="ui-update-bar"
      data-build-id={newer}
    >
      <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-between gap-3">
        <p className="m-0 text-sm text-text-primary">A new version is available.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[36px] rounded-md bg-accent-green px-3 py-1.5 text-sm font-semibold text-black hover:brightness-110"
          data-testid="ui-update-reload"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
