/**
 * Purpose: Tests for TokenPerformanceCard — tracker identity plus tracker metrics,
 *          with both links pointing at the in-app detail page.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TokenPerformanceCard } from '../TokenPerformanceCard';
import type { LaunchRecord } from '@/lib/api/launches';
import type { TokenMetricsResponse } from '@/lib/types/backend';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const MINT = 'MinT1111111111111111111111111111111111111111';

const LAUNCH: LaunchRecord = {
  mint: MINT,
  creator_wallet: 'Wa11et',
  quote_mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  name: 'Agent One',
  symbol: 'AGENT',
  image_url: 'https://img/agent.png',
  launch_signature: 'sig',
  fee_lamports: 1,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-01T00:00:00Z',
};

const METRICS: TokenMetricsResponse = {
  marketCapUsd: 12400,
  solRaised: 3.2,
  bondingCurvePercent: 42,
  complete: false,
  createdAt: '2026-09-01T00:00:00Z',
  imageUrl: 'https://img/agent.png',
  holders: 847,
  priceUsd: 0.0042,
};

const ALL_NULL: TokenMetricsResponse = {
  marketCapUsd: null,
  solRaised: null,
  bondingCurvePercent: null,
  complete: null,
  createdAt: null,
  imageUrl: null,
  holders: null,
  priceUsd: null,
};

describe('TokenPerformanceCard', () => {
  it('renders nothing without a mint', () => {
    const { container } = render(<TokenPerformanceCard mint={null} launch={null} isLoading={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the symbol and the quote it trades against', () => {
    render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={METRICS} isLoading={false} quoteSymbol="STONK" />);
    expect(screen.getByTestId('perf-symbol')).toHaveTextContent('$AGENT');
    expect(screen.getByTestId('perf-quote')).toHaveTextContent('STONK');
  });

  it('shows market cap from the tracker metrics', () => {
    render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={METRICS} isLoading={false} />);
    expect(screen.getByTestId('perf-market-cap')).toHaveTextContent('$12.4k');
  });

  it('shows curve progress', () => {
    render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={METRICS} isLoading={false} />);
    expect(screen.getByTestId('perf-bonding-bar')).toHaveTextContent('42%');
  });

  it('shows price and holders', () => {
    render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={METRICS} isLoading={false} />);
    expect(screen.getByTestId('perf-price')).toHaveTextContent('$0.0042');
    /* Holder counts drop the token account itself, like the detail page. */
    expect(screen.getByTestId('perf-holders')).toHaveTextContent('846');
  });

  it('dashes out missing numbers but still renders the card', () => {
    render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={ALL_NULL} isLoading={false} />);
    expect(screen.getByTestId('token-performance-card')).toBeInTheDocument();
    expect(screen.getByTestId('perf-market-cap')).toHaveTextContent('-');
    expect(screen.getByTestId('perf-holders')).toHaveTextContent('-');
  });

  it('links both actions to the in-app detail page', () => {
    render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={METRICS} isLoading={false} />);
    expect(screen.getByTestId('perf-details')).toHaveAttribute('href', `/tokens/${MINT}`);
    expect(screen.getByTestId('perf-trade')).toHaveAttribute('href', `/tokens/${MINT}`);
  });

  it('falls back to what the launch flow knows before the tracker answers', () => {
    render(<TokenPerformanceCard mint={MINT} launch={null} isLoading={false} fallbackName="Agent One" fallbackSymbol="AGENT" />);
    expect(screen.getByTestId('perf-symbol')).toHaveTextContent('$AGENT');
    expect(screen.getByText('Agent One')).toBeInTheDocument();
  });

  it('shows the skeleton while the tracker is still answering', () => {
    render(<TokenPerformanceCard mint={MINT} launch={null} isLoading={true} />);
    expect(screen.getByTestId('token-performance-skeleton')).toBeInTheDocument();
  });

  it('prefers the pinned thumb for its 36 px tile and falls back to the master', () => {
    const { unmount, container } = render(
      <TokenPerformanceCard
        mint={MINT}
        launch={{ ...LAUNCH, imageThumbUrl: 'https://img/agent-thumb.webp' }}
        metrics={METRICS}
        isLoading={false}
      />,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img/agent-thumb.webp');
    unmount();
    const second = render(<TokenPerformanceCard mint={MINT} launch={LAUNCH} metrics={METRICS} isLoading={false} />);
    expect(second.container.querySelector('img')).toHaveAttribute('src', 'https://img/agent.png');
  });
});
