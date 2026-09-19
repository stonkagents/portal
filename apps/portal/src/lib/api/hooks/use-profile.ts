/**
 * Purpose: React Query hook for authenticated profile data via daemon proxy
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { queryKeys } from '@/lib/api/keys';
import { appConfig } from '@/lib/config/app.config';
import { transformProfile, type TransformedProfile } from '@/lib/api/transformers/profile';
import { useDaemon } from '@/providers/DaemonProvider';
import type { RawProfileResponse } from '@/lib/types/backend';

export function useProfile() {
  /* The profile is read through the agent: nothing is asked of localhost while it is offline. */
  const { connected } = useDaemon();
  return useQuery<TransformedProfile>({
    queryKey: queryKeys.profile.me,
    queryFn: async () => {
      const raw = await daemonFetch<RawProfileResponse>('/profile/me');
      return transformProfile(raw);
    },
    enabled: appConfig.useRealDaemon && connected,
  });
}
