/**
 * Purpose: The curated packs: the catalog from the tracker (GET /api/packs), and
 *          the install surface on the agent (what is installed, installing, removing).
 *          The catalog is public and loads for everyone; the three agent calls only
 *          run while the agent is connected, because they are loopback calls.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { transformPacks } from '@/lib/api/transformers/gallery';
import {
  getInstalledPackItems,
  installPackItems,
  removeInstalledPackItem,
  type InstalledPacksAnswer,
  type PackInstallAnswer,
  type PackInstallRequest,
  type PackRemoveAnswer,
} from '@/lib/api/daemon-packs';
import { packWroteSomething } from '@/lib/utils/pack-install';
import { useDaemon } from '@/providers/DaemonProvider';
import type { PortalPack } from '@/lib/types/backend';

export function usePacks() {
  return useQuery({
    queryKey: queryKeys.gallery.packs,
    queryFn: async () => {
      const raw = await apiClient<PortalPack[]>('/api/packs');
      return transformPacks(raw);
    },
  });
}

/**
 * What this agent has installed. The answer's own `status` can be `not_ready`
 * while the command tools are finishing, which is a state to show, not an error:
 * it is why the install controls wait.
 */
export function useInstalledPacks() {
  const { connected } = useDaemon();
  return useQuery<InstalledPacksAnswer>({
    queryKey: queryKeys.daemon.packsInstalled,
    queryFn: getInstalledPackItems,
    enabled: connected,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
}

/**
 * Install a pack, named items, or one item by CID. The answer carries one row
 * per requested item: one bad item does not fail the rest, so callers render
 * rows rather than a single verdict. The installed list is reloaded whenever
 * something was actually written.
 */
export function useInstallPack() {
  const queryClient = useQueryClient();
  return useMutation<PackInstallAnswer, Error, PackInstallRequest>({
    mutationFn: installPackItems,
    onSuccess: answer => {
      if (packWroteSomething(answer.results)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.daemon.packsInstalled });
      }
    },
  });
}

/** Remove one installed item by its item id (not the skill name). */
export function useRemovePackItem() {
  const queryClient = useQueryClient();
  return useMutation<PackRemoveAnswer, Error, string>({
    mutationFn: removeInstalledPackItem,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.daemon.packsInstalled });
    },
  });
}
