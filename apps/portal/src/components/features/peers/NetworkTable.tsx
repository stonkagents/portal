/**
 * Network Table — full peer directory with search, filter, sort, pagination
 */
'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { truncateAgentId } from '@/lib/utils/format';
import { Table, Badge, Input, FilterChip, Icon, Button } from '@/components/ui';
import type { Peer } from '@/lib/types';

interface NetworkTableProps {
  peers: Peer[];
  onPeerClick?: (peer: Peer) => void;
  className?: string;
}

type StatusFilter = 'all' | 'online' | 'seeding' | 'leeching' | 'offline';
type SortField = 'reputation' | 'assetsShared';

const statusVariant: Record<string, 'online' | 'seeding' | 'leeching' | 'offline' | 'danger'> = {
  online: 'online',
  seeding: 'seeding',
  leeching: 'leeching',
  offline: 'offline',
};

export function NetworkTable({ peers, onPeerClick, className }: NetworkTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('reputation');
  const [page, setPage] = useState(1);
  const perPage = 14;

  const filtered = useMemo(() => {
    let result = peers;
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => p.displayName.toLowerCase().includes(q) || p.agentId.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => (sortBy === 'reputation' ? b.reputation - a.reputation : b.assetsShared - a.assetsShared));
    return result;
  }, [peers, statusFilter, search, sortBy]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const filters: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Online', value: 'online' },
    { label: 'Seeding', value: 'seeding' },
    { label: 'Offline', value: 'offline' },
  ];

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="network-table">
      {/* Toolbar: filters + search + sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {filters.map(f => (
            <FilterChip
              key={f.value}
              label={f.label}
              active={statusFilter === f.value}
              onClick={() => {
                setStatusFilter(f.value);
                setPage(1);
              }}
            />
          ))}
        </div>
        <div className="flex-1 min-w-[200px]">
          <Input
            icon="search"
            placeholder="Search network..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="network-search"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortField)}
          className="h-11 rounded-md border border-border-default bg-bg-input px-3 text-sm text-text-primary min-h-[44px]"
          data-testid="network-sort"
          aria-label="Sort peers by"
        >
          <option value="reputation">Reputation</option>
          <option value="assetsShared">Assets</option>
        </select>
      </div>

      {/* Table */}
      <Table>
        <Table.Head>
          <tr>
            <Table.TH>Agent ID</Table.TH>
            <Table.TH className="hidden md:table-cell">Agent Name</Table.TH>
            <Table.TH>Status</Table.TH>
            <Table.TH className="hidden md:table-cell">Location</Table.TH>
            <Table.TH className="hidden md:table-cell" align="right">
              Assets
            </Table.TH>
            <Table.TH align="right">Reputation</Table.TH>
          </tr>
        </Table.Head>
        <Table.Body>
          {paged.map(peer => (
            <Table.Row key={peer.id} className="cursor-pointer" onClick={() => onPeerClick?.(peer)}>
              <Table.TD className="font-mono text-xs">
                <span title={peer.agentId}>{truncateAgentId(peer.agentId)}</span>
              </Table.TD>
              <Table.TD className="hidden md:table-cell font-medium">{peer.displayName}</Table.TD>
              <Table.TD>
                <Badge variant={statusVariant[peer.status] ?? 'offline'} dot>
                  {peer.status.charAt(0).toUpperCase() + peer.status.slice(1)}
                </Badge>
              </Table.TD>
              <Table.TD className="hidden md:table-cell text-text-secondary">{peer.country}</Table.TD>
              <Table.TD className="hidden md:table-cell font-mono" align="right">
                {peer.assetsShared}
              </Table.TD>
              <Table.TD align="right">
                <span
                  className={cn(
                    'font-mono font-bold',
                    peer.reputation >= 7 ? 'text-accent-green' : peer.reputation >= 4 ? 'text-accent-yellow' : 'text-accent-red',
                  )}
                >
                  {peer.reputation.toFixed(1)}
                </span>
              </Table.TD>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} of {filtered.length} peers
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              data-testid="pagination-prev"
            >
              <Icon name="chevron-left" size="sm" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <Button
                key={n}
                variant={n === page ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setPage(n)}
                data-testid={`pagination-${n}`}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
              data-testid="pagination-next"
            >
              <Icon name="chevron-right" size="sm" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
