/**
 * The trade panel for $AGENT, a pool under stonk.fun's platform config: it is
 * traded like ours, against the pool the page read (platform config inside),
 * the fee line names that platform and carries no holders' share; without a
 * pool it is honest, and links out only when a venue URL is configured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { pool } from './fixtures';

vi.mock('@/lib/launchlab/build-launch', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/launchlab/build-launch');
  return { ...actual, isMockLaunch: () => false };
});
vi.mock('@/lib/wallet', () => ({
  useWalletService: () => ({ connected: false, publicKey: null, balance: 0, signAndSend: vi.fn(), fetchBalance: vi.fn(), connect: vi.fn() }),
}));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
const quoteBuy = vi.fn();
vi.mock('@/lib/launchlab/trading', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/launchlab/trading');
  return { ...actual, quoteBuy: (...args: unknown[]) => quoteBuy(...args) };
});

import { TokenTrading } from '../TokenTrading';
import { externalAgentToken } from '../../_lib/external-token';
import { feeSplit, feeSplitLine, holdersShareLine } from '../../_lib/fees';

const stonkfunPool = {
  ...pool,
  quoteMint: 'So11111111111111111111111111111111111111112',
  platformId: 'StonkFunPlatform111111111111111111111111111',
  platformName: 'stonk.fun',
  fees: { protocolBps: 25, platformBps: 100, creatorBps: 0, totalBps: 125 },
};
const agent = externalAgentToken(stonkfunPool);
function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers });

describe('externalAgentToken', () => {
  it('is built from the environment and the pool, with nothing only a record could know', () => {
    expect(agent).toMatchObject({
      symbol: 'AGENT',
      name: 'StonkAgents',
      source: 'external',
      quoteSymbol: 'SOL',
      quoteCategory: 'solana',
      poolId: stonkfunPool.poolId,
      creator: stonkfunPool.creator,
      transferFeeBps: null,
      imageUrl: null,
      metadataUri: null,
      launchedAt: '',
      marketCapUsd: null,
      priceUsd: null,
      curveProgressPct: stonkfunPool.progressPct,
    });
    expect(externalAgentToken(null)).toMatchObject({ source: 'external', poolId: null, creator: '', quoteSymbol: 'STONK' });
  });
});

describe('fee split for an external pool', () => {
  it("names the pool's platform, carries no holders' share, and fills nothing in from our config", () => {
    const split = feeSplit(agent, stonkfunPool);
    expect(split).toEqual({ holderTaxBps: 0, platformBps: 100, protocolBps: 25, creatorBps: 0, totalBps: 125 });
    expect(feeSplitLine(split, 'stonk.fun')).toBe('1.25% fee per trade: 0.25% Raydium · 1% stonk.fun');
    expect(holdersShareLine(split, 'SOL')).toBeNull();
    expect(feeSplit(agent, undefined).totalBps).toBe(0);
  });
});

describe('TokenTrading against an external pool', () => {
  beforeEach(() => quoteBuy.mockReset());

  it('opens the trade panel on the pool the page read and names its platform in the fee line', () => {
    render(<TokenTrading token={agent} pool={stonkfunPool} poolError={null} poolLoading={false} quoteSymbol="SOL" quoteUsd={null} />);
    expect(screen.getByTestId('token-trading')).toBeInTheDocument();
    expect(screen.getByTestId('trade-fee-line')).toHaveTextContent('1.25% fee per trade: 0.25% Raydium · 1% stonk.fun');
    expect(screen.getByTestId('trade-fee-line')).not.toHaveTextContent('holders');
    expect(screen.getByTestId('trade-fee-line')).not.toHaveTextContent('Token-2022');
    expect(screen.queryByText(/predates the launchpad/)).toBeNull();
  });

  it('is honest without a pool: the error, and a venue link only when one is configured', () => {
    const { rerender } = render(
      <TokenTrading token={agent} pool={undefined} poolError="cannot found pool" poolLoading={false} quoteSymbol="SOL" quoteUsd={null} />,
    );
    expect(screen.getByTestId('token-trading-unavailable')).toHaveTextContent('Could not read the pool: cannot found pool');
    expect(screen.queryByTestId('token-trading-external')).toBeNull();

    rerender(
      <TokenTrading
        token={agent}
        pool={undefined}
        poolError="cannot found pool"
        poolLoading={false}
        quoteSymbol="SOL"
        quoteUsd={null}
        externalHref="https://stonk.fun/token/AGENT"
      />,
    );
    expect(screen.getByTestId('token-trading-external-note')).toHaveTextContent('Could not read the AGENT pool here: cannot found pool');
    expect(screen.getByTestId('token-trading-external')).toHaveAttribute('href', 'https://stonk.fun/token/AGENT');
    expect(screen.getByTestId('token-trading-external')).toHaveTextContent('Buy AGENT');
  });

  it('keeps the plain no-pool notice without an error or a URL', () => {
    render(<TokenTrading token={agent} pool={undefined} poolError={null} poolLoading={false} quoteSymbol="SOL" quoteUsd={null} />);
    expect(screen.getByTestId('token-trading-unavailable')).toHaveTextContent('The pool is not on this network yet.');
  });
});
