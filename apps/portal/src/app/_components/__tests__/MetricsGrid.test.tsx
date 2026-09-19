/**
 * Purpose: Tests for MetricsGrid — extracted metrics display with per-field null handling
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MetricsGrid } from '../MetricsGrid';
import type { TokenMetricsResponse } from '@/lib/types/backend';

const FULL_METRICS: TokenMetricsResponse = {
  marketCapUsd: 12400,
  solRaised: 3.2,
  bondingCurvePercent: 42,
  complete: false,
  createdAt: '2026-02-15T10:00:00Z',
  imageUrl: 'https://pump.fun/img/test.png',
  holders: 847,
  priceUsd: 0.0042,
};

const ALL_NULL_METRICS: TokenMetricsResponse = {
  marketCapUsd: null,
  solRaised: null,
  bondingCurvePercent: null,
  complete: null,
  createdAt: null,
  imageUrl: null,
  holders: null,
  priceUsd: null,
};

describe('MetricsGrid', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all 4 metric labels when data is present', () => {
    render(<MetricsGrid data={FULL_METRICS} isLoading={false} />);
    expect(screen.getByText('Mkt Cap')).toBeInTheDocument();
    expect(screen.getByText('Holders')).toBeInTheDocument();
    expect(screen.getByText('SOL Raised')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('shows formatted market cap value', () => {
    render(<MetricsGrid data={FULL_METRICS} isLoading={false} />);
    expect(screen.getByTestId('metric-mkt-cap')).toHaveTextContent('$12.4k');
  });

  it('shows holders count', () => {
    render(<MetricsGrid data={FULL_METRICS} isLoading={false} />);
    expect(screen.getByTestId('metric-holders')).toHaveTextContent('847');
  });

  it('shows SOL raised', () => {
    render(<MetricsGrid data={FULL_METRICS} isLoading={false} />);
    expect(screen.getByTestId('metric-sol-raised')).toHaveTextContent('3.2');
  });

  it('shows relative time for created', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    render(<MetricsGrid data={FULL_METRICS} isLoading={false} />);
    expect(screen.getByTestId('metric-created')).toHaveTextContent('2h ago');
  });

  it('shows dash for individual null fields', () => {
    const partialMetrics: TokenMetricsResponse = {
      ...FULL_METRICS,
      holders: null,
    };
    render(<MetricsGrid data={partialMetrics} isLoading={false} />);
    expect(screen.getByTestId('metric-holders')).toHaveTextContent('-');
    // Mkt Cap should still show value
    expect(screen.getByTestId('metric-mkt-cap')).toHaveTextContent('$12.4k');
  });

  it('shows "Checking on-chain data..." when all fields are null', () => {
    render(<MetricsGrid data={ALL_NULL_METRICS} isLoading={false} />);
    expect(screen.getByTestId('metrics-checking')).toBeInTheDocument();
    expect(screen.getByText('Checking on-chain data...')).toBeInTheDocument();
  });

  it('shows "Checking on-chain data..." when data is undefined', () => {
    render(<MetricsGrid data={undefined} isLoading={false} />);
    expect(screen.getByTestId('metrics-checking')).toBeInTheDocument();
  });

  it('shows loading skeletons when isLoading is true', () => {
    render(<MetricsGrid data={undefined} isLoading={true} />);
    expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
  });

  it('has responsive grid classes', () => {
    render(<MetricsGrid data={FULL_METRICS} isLoading={false} />);
    const grid = screen.getByTestId('metrics-grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
  });

  it('formats large market cap values', () => {
    const bigMetrics: TokenMetricsResponse = {
      ...FULL_METRICS,
      marketCapUsd: 1_200_000,
    };
    render(<MetricsGrid data={bigMetrics} isLoading={false} />);
    expect(screen.getByTestId('metric-mkt-cap')).toHaveTextContent('$1.2M');
  });
});
