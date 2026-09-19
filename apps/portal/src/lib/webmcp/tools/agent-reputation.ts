/**
 * Purpose: WebMCP tool — look up an agent's reputation by display name.
 *          Two-step: search peers by name, then fetch reputation for found peerId.
 *          Never exposes peer IDs in responses. Rejects peer-ID-shaped input.
 */

import { apiClient, apiClientPaginated } from '@/lib/api/client';
import { portalPeerDisplayName } from '@/lib/api/transformers/peer-ref';
import type { PortalPeer, PortalPeerReputation } from '@/lib/types/backend';
import type { WebMCPToolDefinition } from '../types';
import { ACCESS_BLOCK } from '../constants';

/** Reject peer-ID-shaped input to prevent accidental peer ID exposure */
const PEER_ID_PATTERN = /^(Qm|12D)[a-zA-Z0-9]{10,}/;

export const agentReputationTool: WebMCPToolDefinition = {
  name: 'getAgentReputation',
  description:
    "Look up an agent's reputation score and factor breakdown by their display name. " +
    'Shows bandwidth, quality, security, and citizenship scores plus earned badges.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Display name of the agent to look up' },
    },
    required: ['agent_name'],
  },
  execute: async params => {
    const agentName = String(params.agent_name ?? '');

    if (PEER_ID_PATTERN.test(agentName)) {
      return {
        error: 'Please use a display name, not a peer ID.',
        access: ACCESS_BLOCK,
      };
    }

    try {
      const { data: peers } = await apiClientPaginated<PortalPeer[]>(`/api/peers?q=${encodeURIComponent(agentName)}&limit=1`);

      if (!peers || peers.length === 0) {
        return {
          error: `No agent found with name "${agentName}". Try a different name.`,
          access: ACCESS_BLOCK,
        };
      }

      const peer = peers[0];
      const rep = await apiClient<PortalPeerReputation>(`/api/peers/${peer.peerId}/reputation`);

      return {
        name: peer.name,
        display_name: portalPeerDisplayName(peer) ?? null,
        rank: rep.tier ?? 'new',
        composite_score: Math.round((rep.composite_score ?? 0) * 100),
        factors: {
          bandwidth: Math.round((rep.bandwidth_score ?? 0) * 10 * 10) / 10,
          quality: Math.round((rep.quality_score ?? 0) * 10 * 10) / 10,
          security: Math.round((rep.security_score ?? 0) * 10 * 10) / 10,
          citizenship: Math.round((rep.citizenship_score ?? 0) * 10 * 10) / 10,
        },
        badges: (rep.badges ?? []).map(b => ({
          id: b.id,
          status: b.status,
        })),
        weekly_bonus: rep.weekly_bonus ?? 0,
        trend: rep.trend,
        shared_files: peer.sharedFiles,
        // peerId intentionally excluded
        // id intentionally excluded
        access: ACCESS_BLOCK,
      };
    } catch {
      return {
        error: 'Reputation lookup temporarily unavailable. Try again shortly.',
        access: ACCESS_BLOCK,
      };
    }
  },
};
