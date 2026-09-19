/**
 * The $AGENT network-token panel: burned so far from the mint against the
 * pool's created supply, the tracker's burn ledger when served, and the
 * holder count from the chain, drawn as the burn panel's ring, facts and
 * chart. The burn schedule and the launch-buy line exist only when the
 * environment states them; the test environment states none, and one case
 * stubs a full set to see them drawn.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { featuredAgentToken } from '@/lib/agent-token';
import type { AgentTokenStats } from '@/lib/api/hooks/use-agent-token';
import { pool } from '@/app/tokens/_components/__tests__/fixtures';

const idle = { data: undefined, isLoading: false, isError: false, error: null };
const useMintInfo = vi.fn();
const useAllHolders = vi.fn();
const useBurnPlan = vi.fn();
vi.mock('@/app/tokens/_lib/use-token-chain-data', () => ({
  useMintInfo: (m: unknown) => useMintInfo(m),
  useAllHolders: (m: unknown, p: unknown, a: unknown) => useAllHolders(m, p, a),
}));
vi.mock('@/lib/api/hooks/use-agent-ledgers', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBurnPlan: (enabled: unknown) => useBurnPlan(enabled),
}));
const useStonkfunBurnPlan = vi.fn();
vi.mock('@/lib/api/hooks/use-stonkfun-token', () => ({
  useStonkfunBurnPlan: (m: unknown, s: unknown, e: unknown) => useStonkfunBurnPlan(m, s, e),
}));

import { AgentTokenPanel, useAgentNetworkData } from '../AgentTokenPanel';

const MINT = 'HzJh3iPHf8u5pauuTD8Am6MMCNDqHeiwm36aCRSwF6MU';
const CREATOR = 'B4zriLYv4YZhHHUjvfbDN6pAGqBUbdMbfXLZfcaxNbEa';
const agent = featuredAgentToken(MINT);
const stonkfunPool = {
  ...pool,
  mint: MINT,
  creator: CREATOR,
  quoteMint: 'So11111111111111111111111111111111111111112',
  platformName: 'stonk.fun',
};
const live: AgentTokenStats = {
  name: null,
  symbol: null,
  image: null,
  quoteSymbol: 'SOL',
  mcapUsd: null,
  priceUsd: null,
  priceQuote: pool.priceQuote,
  mcapQuote: pool.priceQuote * pool.supplyBase,
  supply: pool.supplyBase,
  holders: null,
  change24h: null,
  volume24h: null,
  liquidityUsd: null,
  curveProgressPct: 3,
  graduated: false,
  quoteMint: stonkfunPool.quoteMint,
  poolId: pool.poolId,
  creatorWallet: CREATOR,
  platformId: pool.platformId,
  platformName: 'stonk.fun',
  transferFeeBps: null,
  launchedAt: null,
};
const mintInfo = {
  program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  isToken2022: false,
  decimals: 6,
  supply: 998_750_000,
  mintAuthority: null,
  freezeAuthority: null,
  transferFee: null,
};
const holders = {
  holders: [
    { owner: 'PoolAuthority', account: 'VaultA', amount: 918_000_000, percent: 91.8, isPool: true, withheld: 0 },
    { owner: CREATOR, account: 'CreatorAta', amount: 50_000_020, percent: 5, isPool: false, withheld: 0 },
    { owner: 'WalletB', account: 'AtaB', amount: 3_000_000, percent: 0.3, isPool: false, withheld: 0 },
    { owner: 'WalletC', account: 'AtaC', amount: 2_000_000, percent: 0.2, isPool: false, withheld: 0 },
  ],
  supply: 998_750_000,
  capped: false,
  withheldTotal: 0,
};

function Harness({ poolState = stonkfunPool }: { poolState?: typeof stonkfunPool | null }) {
  const data = useAgentNetworkData(agent, live, poolState);
  return <AgentTokenPanel token={agent} data={data} />;
}

describe('useAgentNetworkData + AgentTokenPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMintInfo.mockReturnValue({ ...idle, data: mintInfo });
    useAllHolders.mockReturnValue({ ...idle, data: holders });
    useBurnPlan.mockReturnValue({ status: 'not-built' });
    useStonkfunBurnPlan.mockReturnValue({ status: 'idle' });
  });

  it("reads the holders through the mint program, flagging the pool's vault, and takes the pool as given", () => {
    render(<Harness />);
    expect(useMintInfo).toHaveBeenCalledWith(MINT);
    expect(useAllHolders).toHaveBeenCalledWith(MINT, mintInfo.program, [pool.vaultBase, pool.poolId]);
  });

  it("burned so far is the pool's created supply minus the live supply; without a ledger or a schedule the state is honest", () => {
    render(<Harness />);
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('1,250,000 $AGENT');
    expect(screen.getByTestId('burn-fact-total-hint')).toHaveTextContent('0.13% of supply');
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('998,750,000');
    // The share of supply burned is a chain fact and stays; only the plan progress is withheld.
    expect(screen.getByTestId('burn-ring-percent')).toHaveTextContent('0.13% burned');
    expect(screen.getByRole('progressbar', { name: 'AGENT burned' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'none');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('No schedule');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('No schedule');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('-');
    expect(screen.queryByTestId('burn-chart')).toBeNull();
    // Nothing the environment did not state: no launch-buy line, no vesting plan, no fee flow.
    expect(screen.queryByTestId('agent-launch-buy')).toBeNull();
    expect(screen.queryByTestId('fees-went-vesting')).toBeNull();
    expect(screen.queryByText(/Streamflow|vested|holder payouts|Where the fees went/)).toBeNull();
  });

  it('counts holders without the curve vault and reports the created supply from the pool', () => {
    let captured: ReturnType<typeof useAgentNetworkData> | null = null;
    function Probe() {
      captured = useAgentNetworkData(agent, live, stonkfunPool);
      return null;
    }
    render(<Probe />);
    expect(captured!.holderCount).toBe(3);
    expect(captured!.createdSupply).toBe(1_000_000_000);
    expect(captured!.creatorWallet).toBe(CREATOR);
    expect(captured!.pool).toBe(stonkfunPool);
  });

  it('reads "-" for the chain figures before the chain has answered, and no supply without the pool', () => {
    useMintInfo.mockReturnValue({ ...idle, isLoading: true });
    useAllHolders.mockReturnValue(idle);
    useBurnPlan.mockReturnValue({ status: 'loading' });
    render(<Harness poolState={null} />);
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('…');
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('-');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('…');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('…');
  });

  it("shows the plan once the tracker serves one, with progress toward the ledger's planTotal", () => {
    useBurnPlan.mockReturnValue({
      status: 'ready',
      data: {
        total: 1_000_000_000,
        planTotal: 100_000_000,
        burned: 1_250_000,
        remaining: 98_750_000,
        burns: 1,
        next: { at: new Date(Date.now() + 3 * 3600_000).toISOString(), amount: 1_250_000 },
        recent: [],
      },
    });
    render(<Harness />);
    expect(screen.getByTestId('burn-countdown')).toHaveTextContent(/^0?2:59:5\d$|^03:00:00$/);
    expect(screen.getByRole('progressbar', { name: 'AGENT burned' })).toHaveAttribute(
      'aria-valuenow',
      String((1_250_000 / 100_000_000) * 100),
    );
    // A next burn but no cadence: no step, no plan sentence, no chart of a guess.
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'none');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('No schedule');
    expect(screen.queryByTestId('burn-chart')).toBeNull();
  });
});

describe('useAgentNetworkData + AgentTokenPanel via stonkfun', () => {
  const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
  const knots = { ...featuredAgentToken(KNOTS), name: 'KNOTS', symbol: 'KNOTS', quoteSymbol: 'STONK' };
  const stonkfunLive: AgentTokenStats = {
    ...live,
    name: 'KNOTS',
    symbol: 'KNOTS',
    quoteSymbol: 'STONK',
    priceQuote: null,
    mcapQuote: null,
    supply: null,
    mcapUsd: 19_403_285.93,
    priceUsd: 0.0194,
    change24h: -10.86,
    volume24h: 1_477_671.96,
    liquidityUsd: 980_821.94,
    curveProgressPct: 100,
    graduated: true,
    quoteMint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
    poolId: 'GeNDy5afAWz7S9w2tMLgpK3xQqXjeDaCvYV9h8joEmjo',
    creatorWallet: 'FYL2HTK3wZyDxdXwEMvCNKhS5J4LyvbggBr6Yj23SUs1',
    platformId: null,
    platformName: 'stonkfun',
    transferFeeBps: 300,
    launchedAt: '2026-09-05T16:34:45.099Z',
  };
  const currentSupply = 998_724_544.962446;
  const knotsMint = { ...mintInfo, program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', isToken2022: true, supply: currentSupply };
  /** stonkfun's burns as the hook shapes them: no target, no next burn, no cadence. */
  const flywheelPlan = {
    total: 1_000_000_000,
    planTotal: null,
    burned: 1_275_455.037554,
    remaining: currentSupply,
    burns: 1966,
    next: null,
    schedule: null,
    recent: [
      {
        at: '2026-09-14T16:15:58.148Z',
        amount: 7043.046204,
        sig: '4RaJAZQW3eJaa2P7ZcQhLxzDnGcUk62K9dSUF1bK8s6YNNM1YkD9tkNu6JJdkViBDgGcJipaRoagff7ieHRzAb4P',
      },
      {
        at: '2026-09-14T16:05:53.020Z',
        amount: 200.615007,
        sig: 'dWwbT8Rr83TL29LxwsAyyeHE8rFRbWnySeV2DNUsYedJTMsUfC5fx3odRvYWwfW5v1xtm2wCoHyn2w7c7JHrtjH',
      },
    ],
  };

  function Stonkfun() {
    const data = useAgentNetworkData(knots, stonkfunLive, null, 'stonkfun');
    return <AgentTokenPanel token={knots} data={data} />;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useMintInfo.mockReturnValue({ ...idle, data: knotsMint });
    useAllHolders.mockReturnValue({ ...idle, data: holders });
    useBurnPlan.mockReturnValue({ status: 'idle' });
    useStonkfunBurnPlan.mockReturnValue({ status: 'ready', data: flywheelPlan });
  });

  it("reads stonkfun's burns for the mint with the live supply, leaves the tracker ledger idle, and still counts holders through the Token-2022 mint", () => {
    let captured: ReturnType<typeof useAgentNetworkData> | null = null;
    function Probe() {
      captured = useAgentNetworkData(knots, stonkfunLive, null, 'stonkfun');
      return null;
    }
    render(<Probe />);
    expect(useStonkfunBurnPlan).toHaveBeenCalledWith(KNOTS, currentSupply, true);
    expect(useBurnPlan).toHaveBeenCalledWith(false);
    expect(useAllHolders).toHaveBeenCalledWith(KNOTS, knotsMint.program, [stonkfunLive.poolId]);
    expect(captured!.holderCount).toBe(3);
    expect(captured!.burnPlan).toEqual({ status: 'ready', data: flywheelPlan });
    // No pool: the created supply is what the ledger read back off the mint.
    expect(captured!.createdSupply).toBe(1_000_000_000);
    expect(captured!.creatorWallet).toBe(stonkfunLive.creatorWallet);
    expect(captured!.launchedAt).toBe('2026-09-05T16:34:45.099Z');
  });

  it('draws the ring from the real burned supply, charts the flywheel burns, and reads the burns themselves in place of a schedule', () => {
    render(<Stonkfun />);
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('998,724,545');
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('1,275,455 $KNOTS');
    expect(screen.getByTestId('burn-ring-percent')).toHaveTextContent('0.13% burned');
    // A flywheel has no schedule: the facts are its burn count, its latest burn and the plain sentence.
    expect(screen.getByTestId('burn-fact-step')).toHaveTextContent('Burns so far');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('1,966');
    expect(screen.getByTestId('burn-fact-step-hint')).toHaveTextContent('latest 7,043 KNOTS');
    expect(screen.getByTestId('burn-fact-next')).toHaveTextContent('Last burn');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('Sep 14, 16:15 UTC');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('Buybacks burn $KNOTS as trading fees come in; no fixed schedule');
    // No plan target: the share burned is a chain fact, but nothing is dressed up as progress toward a plan.
    expect(screen.getByRole('progressbar', { name: 'KNOTS burned' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-plan', 'ready');
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'none');
    // The listed burns are the chart: done bars only.
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-done', '2');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-planned', '0');
    expect(screen.getByTestId('burn-chart')).toHaveTextContent('7,043');
    expect(screen.getByTestId('burn-chart')).toHaveTextContent('Sep 14, 16:05');
  });

  it('reads "-" while stonkfun has not answered and says so when it cannot', () => {
    useMintInfo.mockReturnValue({ ...idle, isLoading: true });
    useStonkfunBurnPlan.mockReturnValue({ status: 'loading' });
    const { unmount } = render(<Stonkfun />);
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('…');
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('-');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('…');
    unmount();
    useStonkfunBurnPlan.mockReturnValue({ status: 'error', error: new Error('stonkfun returned 503') });
    render(<Stonkfun />);
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-plan', 'error');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('-');
  });
});

describe('AgentTokenPanel with a configured plan', () => {
  const env = {
    NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: '15',
    NEXT_PUBLIC_AGENT_BURN_STEP_PCT: '1',
    NEXT_PUBLIC_AGENT_BURN_INTERVAL: '1d',
    NEXT_PUBLIC_AGENT_TEAM_PCT: '5',
    NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE: '2027-01-15',
    NEXT_PUBLIC_AGENT_VESTING_CLIFF_DATE: '2027-04-01',
    NEXT_PUBLIC_AGENT_VESTING_CADENCE: 'weekly',
    NEXT_PUBLIC_AGENT_VESTING_MONTHS: '18',
    NEXT_PUBLIC_AGENT_LAUNCH_BUY_PCT: '20',
  };

  beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    useMintInfo.mockReturnValue({ ...idle, data: mintInfo });
    useAllHolders.mockReturnValue({ ...idle, data: holders });
    useBurnPlan.mockReturnValue({ status: 'not-built' });
    useStonkfunBurnPlan.mockReturnValue({ status: 'idle' });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('draws the daily schedule and the launch-buy line from what the environment states', async () => {
    const mod = await import('../AgentTokenPanel');
    const { featuredAgentToken: featured } = await import('@/lib/agent-token');
    const token = featured(MINT);
    function Configured() {
      const data = mod.useAgentNetworkData(token, live, stonkfunPool);
      return <mod.AgentTokenPanel token={token} data={data} />;
    }
    render(<Configured />);
    expect(screen.getByTestId('agent-launch-buy')).toHaveTextContent('Launch buy 20% of supply: 15% to burn, 5% vested');
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'config');
    expect(screen.getByTestId('burn-fact-step')).toHaveTextContent('Daily burn');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('10,000,000 AGENT');
    expect(screen.getByTestId('burn-fact-step-hint')).toHaveTextContent('≈ 1% of supply + protocol buybacks');
    // 1% steps of a 15% plan: 0 of 15 done at 1,250,000 burned; progress runs toward the plan's 150M.
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('~1% of supply will be burnt daily for 15 days = 15% supply+ 50% of platform fees collected to burn $AGENT');
    expect(screen.getByRole('progressbar', { name: 'AGENT burned' })).toHaveAttribute(
      'aria-valuenow',
      String((1_250_000 / 150_000_000) * 100),
    );
    // With no start (no launch time, no NEXT_PUBLIC_AGENT_BURN_START) the next burn is unknown; the
    // chart still shows the fifteen planned burns, undated. Team vesting is not drawn.
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('-');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-planned', '15');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-next', '0');
    expect(screen.getByTestId('burn-chart')).toHaveTextContent('firstlast');
    expect(screen.queryByTestId('fees-went-vesting')).toBeNull();
  });

  it('counts down to the next burn and dates the chart once a start is known', async () => {
    vi.stubEnv('NEXT_PUBLIC_AGENT_BURN_START', new Date(Date.now() - 36 * 3600_000).toISOString());
    const mod = await import('../AgentTokenPanel');
    const { featuredAgentToken: featured } = await import('@/lib/agent-token');
    const token = featured(MINT);
    function Configured() {
      const data = mod.useAgentNetworkData(token, live, stonkfunPool);
      return <mod.AgentTokenPanel token={token} data={data} />;
    }
    render(<Configured />);
    expect(screen.getByTestId('burn-countdown')).toHaveTextContent(/^\d{2}:\d{2}:\d{2}$/);
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-next', '1');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-planned', '14');
    expect(screen.getByTestId('burn-chart-next-marker')).toBeInTheDocument();
    expect(screen.getByTestId('burn-chart')).not.toHaveTextContent('first');
    expect(screen.queryByTestId('fees-went-vesting')).toBeNull();
  });
});
