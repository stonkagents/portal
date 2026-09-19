/**
 * Purpose: Trusted/blocked peer management — untrust, unblock, peer lookup
 */
'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, Button, EmptyState } from '@/components/ui';
import { agentLabel } from '@/lib/agent-name';
import type { Peer } from '@/lib/types/peer';

interface TrustedAgentsListProps {
  trustedIds: string[];
  blockedIds: string[];
  peers: Peer[];
  onUntrust: (peerId: string) => void;
  onUnblock: (peerId: string) => void;
}

export function TrustedAgentsList({ trustedIds, blockedIds, peers, onUntrust, onUnblock }: TrustedAgentsListProps) {
  const peerMap = useMemo(() => {
    const map = new Map<string, Peer>();
    for (const p of peers) map.set(p.id, p);
    return map;
  }, [peers]);

  /* A trusted id the directory no longer lists still prints as a masked id, never a raw one. */
  const resolveName = (id: string) => agentLabel(peerMap.get(id)?.displayName, id);

  return (
    <div className="flex flex-col gap-4" data-testid="trusted-agents-list">
      {/* Trusted section */}
      <div data-testid="trusted-section">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-2">Trusted ({trustedIds.length})</h3>
        {trustedIds.length === 0 ? (
          <EmptyState
            size="sm"
            title="No trusted agents yet."
            description="Trust agents from the Network tab."
            data-testid="trusted-empty"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {trustedIds.map(id => (
              <li
                key={id}
                className="flex items-center justify-between bg-bg-secondary border border-border-default rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="shield" size="sm" className="text-accent-green shrink-0" />
                  <span className="text-sm text-text-primary truncate">{resolveName(id)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUntrust(id)}
                  data-testid={`untrust-${id}`}
                  className={cn('text-text-secondary hover:text-accent-red shrink-0')}
                >
                  <Icon name="x" size="sm" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Blocked section — hidden when empty */}
      {blockedIds.length > 0 && (
        <div data-testid="blocked-section">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-2">Blocked ({blockedIds.length})</h3>
          <ul className="flex flex-col gap-2">
            {blockedIds.map(id => (
              <li
                key={id}
                className="flex items-center justify-between bg-bg-secondary border border-border-default rounded-lg px-3 py-2 opacity-60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="slash" size="sm" className="text-accent-red shrink-0" />
                  <span className="text-sm text-text-primary truncate">{resolveName(id)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUnblock(id)}
                  data-testid={`unblock-${id}`}
                  className={cn('text-text-secondary hover:text-accent-green shrink-0')}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
