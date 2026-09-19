/**
 * The network-token section on its own: the burn panel under the section
 * header, and its honest empty state with nothing configured.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NetworkTokenSection } from '../NetworkTokenSection';
import { formatDate, formatWhen } from '../NetworkTokenPrimitives';
import { launched } from './fixtures';

describe('NetworkTokenSection', () => {
  it('carries the burn panel and nothing else; with nothing configured, no launch-buy line, no schedule and no holders strip', () => {
    // The test environment states no NEXT_PUBLIC_AGENT_* plan, so none is drawn.
    render(<NetworkTokenSection token={launched} createdSupply={1e9} currentSupply={1e9} burnPlan={{ status: 'not-built' }} />);
    expect(screen.getByTestId('network-token-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Network token');
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'none');
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('0 $HOUND');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('No schedule');
    expect(screen.queryByTestId('burn-chart')).toBeNull();
    expect(screen.queryByTestId('holders-tape')).toBeNull();
    expect(screen.queryByTestId('agent-launch-buy')).toBeNull();
    expect(screen.queryByTestId('network-token-venue')).toBeNull();
    expect(screen.queryByText(/Launch buy|Holders|Tape|Latest burns|Burning \$/)).toBeNull();
    expect(screen.queryByText(/vested|Streamflow|locked until/)).toBeNull();
  });

  it('tags the venue the figures come from when it is not this site', () => {
    render(
      <NetworkTokenSection
        token={launched}
        createdSupply={1e9}
        currentSupply={1e9}
        burnPlan={{ status: 'idle' }}
        venue={{ name: 'stonkfun', href: 'https://www.stonkfun.xyz/token/Mint' }}
      />,
    );
    expect(screen.getByTestId('network-token-venue')).toHaveAttribute('href', 'https://www.stonkfun.xyz/token/Mint');
  });
});

describe('time formatting', () => {
  it('formats a ledger time and a date in UTC', () => {
    expect(formatWhen('2026-09-13T21:05:00Z')).toBe('Sep 13, 21:05 UTC');
    expect(formatWhen('nope')).toBe('nope');
    expect(formatDate(Date.parse('2027-01-15'))).toBe('Jan 15, 2027');
    expect(formatDate(Number.NaN)).toBe('-');
  });
});
