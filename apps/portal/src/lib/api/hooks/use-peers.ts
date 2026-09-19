/**
 * Purpose: React Query hooks for peer data — enriched list, reputation, assets, activity, trust/block mutations
 */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { queryKeys } from '@/lib/api/keys';
import { useDaemon } from '@/providers/DaemonProvider';
import { transformPeer, transformPeerReputation } from '@/lib/api/transformers';
import type { PortalPeer, PortalPeerReputation, PortalPeerAsset, PortalPeerActivity } from '@/lib/types/backend';
import type { Peer } from '@/lib/types/peer';

/** Enriched peer list. Shared by usePeers and the network map (same query key, one cache entry). */
export async function fetchPeers(): Promise<Peer[]> {
  const raw = await apiClient<PortalPeer[]>('/api/peers');
  return raw.map(transformPeer);
}

export function usePeers() {
  return useQuery({
    queryKey: queryKeys.peers.all,
    queryFn: fetchPeers,
  });
}

export function usePeerReputation(peerId: string) {
  return useQuery({
    queryKey: queryKeys.peers.reputation(peerId),
    queryFn: async () => {
      const raw = await apiClient<PortalPeerReputation>(`/api/peers/${peerId}/reputation`);
      return transformPeerReputation(raw);
    },
    enabled: !!peerId,
  });
}

export function usePeerAssets(peerId: string) {
  return useQuery({
    queryKey: queryKeys.peers.assets(peerId),
    queryFn: () => apiClient<PortalPeerAsset[]>(`/api/peers/${peerId}/assets`),
    enabled: !!peerId,
  });
}

export function usePeerActivity(peerId: string) {
  return useQuery({
    queryKey: queryKeys.peers.activity(peerId),
    queryFn: () => apiClient<PortalPeerActivity[]>(`/api/peers/${peerId}/activity`),
    enabled: !!peerId,
  });
}

export function useTrustPeer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => daemonFetch<unknown>(`/peers/${id}/trust`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.peers.all });
      qc.invalidateQueries({ queryKey: queryKeys.peers.trusted });
    },
  });
}

export function useBlockPeer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => daemonFetch<unknown>(`/peers/${id}/block`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.peers.all });
      qc.invalidateQueries({ queryKey: queryKeys.peers.blocked });
    },
  });
}

export function useUntrustPeer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => daemonFetch<unknown>(`/peers/${id}/trust`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.peers.all });
      qc.invalidateQueries({ queryKey: queryKeys.peers.trusted });
    },
  });
}

export function useUnblockPeer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => daemonFetch<unknown>(`/peers/${id}/block`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.peers.all });
      qc.invalidateQueries({ queryKey: queryKeys.peers.blocked });
    },
  });
}

/** What the list hooks hand out, whatever the tracker's spelling. */
export interface PeerIdList {
  peer_ids: string[];
}

/**
 * The tracker answers `data: [ids]` (a bare array); older builds answered
 * `{ peer_ids }` or `{ peerIds }`. Anything that is not a string is dropped.
 */
export function readPeerIdList(raw: unknown): PeerIdList {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as { peer_ids?: unknown; peerIds?: unknown }).peer_ids ?? (raw as { peerIds?: unknown }).peerIds)
      : undefined;
  return { peer_ids: Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && id.length > 0) : [] };
}

/* Trust and block lists live on the agent: neither is asked for while it is offline. */
export function useTrustedPeers() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: queryKeys.peers.trusted,
    queryFn: async () => readPeerIdList(await daemonFetch<unknown>('/peers/trusted')),
    enabled: connected,
  });
}

export function useBlockedPeers() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: queryKeys.peers.blocked,
    queryFn: async () => readPeerIdList(await daemonFetch<unknown>('/peers/blocked')),
    enabled: connected,
  });
}
