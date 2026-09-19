/**
 * Purpose: Extracted metrics grid with per-field null handling, loading skeletons,
 *          and all-null "Checking on-chain data..." state.
 */
/* animation-tier: 2 — functional: loading feedback for metrics */
import type { TokenMetricsResponse } from '@/lib/types/backend';

function formatMarketCap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value}`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MetricField({
  label,
  value,
  testId,
  isLoading,
}: {
  label: string;
  value: string | null;
  testId: string;
  isLoading: boolean;
}) {
  return (
    <div className="text-center" data-testid={testId}>
      <div className="text-xs text-text-tertiary mb-0.5">{label}</div>
      <div className="transition-opacity duration-[var(--transition-base)] ease-in-out">
        {isLoading ? (
          <div className="h-5 w-12 mx-auto bg-bg-tertiary rounded animate-pulse" />
        ) : value == null ? (
          <div className="text-sm text-text-tertiary">-</div>
        ) : (
          <div className="font-mono tabular-nums text-sm font-bold text-text-primary">{value}</div>
        )}
      </div>
    </div>
  );
}

interface MetricsGridProps {
  data: TokenMetricsResponse | undefined;
  isLoading: boolean;
  isError?: boolean; // Gate 0 Finding #4: explicit error state
}

export function MetricsGrid({ data, isLoading, isError = false }: MetricsGridProps) {
  // Gate 0 Finding #4 fix: Explicit error state (don't mask as "Checking...")
  if (isError) {
    return (
      <div className="text-center py-4" data-testid="metrics-error">
        <p className="text-sm text-accent-red">Failed to load metrics. Will retry...</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2" data-testid="metrics-loading">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="text-center">
              <div className="h-3 w-10 mx-auto bg-bg-tertiary rounded mb-1" />
              <div className="h-5 w-12 mx-auto bg-bg-tertiary rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const allNull = !data || (data.marketCapUsd == null && data.holders == null && data.solRaised == null && data.createdAt == null);

  if (allNull) {
    return (
      <div className="text-center py-4" data-testid="metrics-checking">
        <p className="text-sm text-text-secondary">Checking on-chain data...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="metrics-grid">
      <MetricField
        label="Mkt Cap"
        value={data.marketCapUsd != null ? formatMarketCap(data.marketCapUsd) : null}
        testId="metric-mkt-cap"
        isLoading={false}
      />
      <MetricField
        label="Holders"
        value={data.holders != null ? String(data.holders) : null}
        testId="metric-holders"
        isLoading={false}
      />
      <MetricField
        label="SOL Raised"
        value={data.solRaised != null ? String(data.solRaised) : null}
        testId="metric-sol-raised"
        isLoading={false}
      />
      <MetricField
        label="Created"
        value={data.createdAt != null ? formatRelativeTime(data.createdAt) : null}
        testId="metric-created"
        isLoading={false}
      />
    </div>
  );
}
