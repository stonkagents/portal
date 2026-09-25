/**
 * Token detail page client component.
 *
 * Layout: an identity card with the stats grid on top, then two columns on
 * wide screens — tabs (Chart · Trades · Holders · Info) on the left; the trade
 * panel, the curve progress and the fee split in a sticky column on the right.
 * On narrow screens the trade panel comes right after the header, so buying
 * does not mean scrolling past the chart.
 *
 * A launch from this site: identity comes from the tracker's launch record;
 * the curve, the price and the fee rates come straight from the LaunchLab
 * pool on chain; the tape, the candles and the 24h figures come from the
 * tracker's trade indexer (the same feed the home card reads), and USD is the
 * tracker's own pricing; the mint account and the holders come off the RPC.
 *
 * $AGENT: a stonk.fun LaunchLab pool the tracker never recorded. The pool is
 * found from the mint and the quote (or `NEXT_PUBLIC_AGENT_POOL`), its
 * platform config is whatever the pool account names, and the tape is read
 * off the RPC. If the pool cannot be read the page says so; nothing is sampled.
 *
 * $AGENT via stonkfun (`NEXT_PUBLIC_AGENT_SOURCE=stonkfun`): the token is
 * what stonkfun's API lists, the burns are its flywheel's, the chart is
 * DexScreener's embed, the trades and the buy button point at stonkfun, and
 * no pool is read. The mint and the holders still come off the RPC.
 *
 * A mint the launchpad does not know renders from the legacy token list,
 * without trading.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { Container, Icon } from '@/components/ui';
import { raiseUnits, useLaunchConfig } from '@/lib/launchlab/launch-config';
import { useExternalPoolState } from '@/lib/launchlab/external-pool';
import { usePoolState } from '@/lib/launchlab/pool-state';
import { cn } from '@/lib/utils/cn';
import { toListing } from '../_lib/gallery-token';
import { externalAgentToken, stonkfunAgentToken } from '../_lib/external-token';
import { resolveTokenRoute, type TokenRoute } from '../_lib/detail-route';
import type { Denomination } from '../_lib/detail-format';
import { useTokenDetail } from '../_lib/use-gallery';
import { useAllHolders, useMintInfo, useTokenRevenue } from '../_lib/use-token-chain-data';
import { useQuoteUsd, useTokenMetadata } from '../_lib/use-token-detail-data';
import { useTokenTape, type TapeSource } from '../_lib/use-token-tape';
import { explorerUrl } from '@/config';
import {
  AGENT_EXTERNAL_BUY_URL,
  AGENT_MINT,
  AGENT_POOL_ID,
  AGENT_QUOTE_MINT,
  AGENT_TOTAL_SUPPLY,
  AGENT_VIA_STONKFUN,
  isAgentMint,
} from '@/lib/agent-token';
import { ledgerForMint, useBurnPlan } from '@/lib/api/hooks/use-agent-ledgers';
import { useStonkfunBurnPlan, useStonkfunToken } from '@/lib/api/hooks/use-stonkfun-token';
import { STONKFUN_NAME, stonkfunTokenUrl } from '@/lib/api/stonkfun';
import { NetworkTokenSection } from './NetworkTokenSection';
import { TokenChartIframe } from './TokenChartIframe';
import { TokenDetailHeader } from './TokenDetailHeader';
import { TokenDetailStats } from './TokenDetailStats';
import { BondingCurveBlock } from './BondingCurveBlock';
import { ChartSection } from './ChartSection';
import { MobileFold } from './MobileFold';
import { LiveTransactions } from './LiveTransactions';
import { PoolPanel } from './PoolPanel';
import { TokenHolders } from './TokenHolders';
import { TokenPanel } from './TokenPanel';
import { TokenTrading } from './TokenTrading';
import { TokenHolderChat } from './TokenHolderChat';
import { TokenDiscussion } from './TokenDiscussion';
import { describeChainError } from '@/lib/solana/rpc-fetch';

type MainTab = 'chart' | 'trades' | 'holders' | 'info' | 'discussion';

const MAIN_TABS: readonly { id: MainTab; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'trades', label: 'Trades' },
  { id: 'holders', label: 'Holders' },
  { id: 'info', label: 'Info' },
  { id: 'discussion', label: 'Discussion' },
];

export function TokenDetailClient() {
  const params = useParams();
  const paramTokenId = typeof params?.tokenId === 'string' ? params.tokenId : null;
  // The static shell is served for every /tokens/<mint>/, so the param may say
  // "placeholder"; the browser's path is read after mount and decides instead.
  const [route, setRoute] = useState<TokenRoute | null>(() => {
    const fromParam = resolveTokenRoute(paramTokenId, null);
    return fromParam.mint ? fromParam : null;
  });
  useEffect(() => {
    setRoute(resolveTokenRoute(paramTokenId, window.location.pathname));
  }, [paramTokenId]);
  const mint = route?.mint ?? null;
  const agentMint = isAgentMint(mint);
  // $AGENT via stonkfun: stonkfun's API is the record, whatever the tracker knows; no pool is read.
  const viaStonkfun = agentMint && AGENT_VIA_STONKFUN;
  const detail = useTokenDetail(viaStonkfun ? null : mint, { enablePolling: true });
  const stonkfun = useStonkfunToken(viaStonkfun ? mint : null);
  // $AGENT has no tracker record: its stonk.fun pool is the record. The tracker being down changes nothing for it.
  const externalAgent = agentMint && !viaStonkfun && (detail.isFetched || detail.isError) && !detail.token;
  const externalPool = useExternalPoolState({
    mint: AGENT_MINT ?? undefined,
    quoteMint: AGENT_QUOTE_MINT,
    poolId: AGENT_POOL_ID,
    enabled: externalAgent,
  });
  const externalToken = useMemo(
    () =>
      viaStonkfun
        ? stonkfun.data
          ? stonkfunAgentToken(stonkfun.data)
          : null
        : externalAgent
          ? externalAgentToken(externalPool.data ?? null)
          : null,
    [viaStonkfun, stonkfun.data, externalAgent, externalPool.data],
  );
  const token = detail.token ?? externalToken;
  const isLoading = viaStonkfun ? stonkfun.isLoading : detail.isLoading;
  const isFetched = viaStonkfun ? stonkfun.isFetched || stonkfun.isError : detail.isFetched;
  const isError = viaStonkfun ? stonkfun.isError && !stonkfun.data : detail.isError;
  const isLaunch = token?.source === 'launch';

  const [denomination, setDenomination] = useState<Denomination>('quote');
  const [tab, setTab] = useState<MainTab>('chart');

  // The program id is not stored on the launch; the launch config for its quote carries it. Only our launches have one.
  const launchConfig = useLaunchConfig(isLaunch ? (token.quoteMint ?? undefined) : undefined);
  const programId = launchConfig.data?.programId;

  const launchPool = usePoolState({
    programId,
    mint: token?.mint,
    quoteMint: token?.quoteMint ?? undefined,
    poolId: token?.poolId ?? undefined,
    enabled: isLaunch,
  });
  const pool = externalAgent ? externalPool : launchPool;

  // The tracker prices a launch itself (priceUsd = priceQuote × the quote's USD price), so the page
  // reads its rate back rather than pricing the quote a second way; anything else asks the price feed.
  const impliedQuoteUsd =
    isLaunch && token.priceUsd != null && token.metrics24h.priceQuote != null && token.metrics24h.priceQuote > 0
      ? token.priceUsd / token.metrics24h.priceQuote
      : null;
  const quoteUsd = useQuoteUsd(impliedQuoteUsd == null ? token?.quoteMint : null);
  const quoteUsdValue = impliedQuoteUsd ?? quoteUsd.data;

  const metadata = useTokenMetadata(token?.metadataUri);
  const mintInfo = useMintInfo(token?.mint);
  const revenue = useTokenRevenue(isLaunch ? token.mint : null);
  // A recorded launch reads the tracker's indexer; an external pool or a legacy token reads the RPC, once the pool is known.
  // Via stonkfun there is no tape: the trades are listed on stonkfun's page.
  const tapeSource: TapeSource = isLaunch ? 'tracker' : 'rpc';
  const tapeReady = Boolean(token) && !viaStonkfun && (!externalAgent || pool.data != null || pool.isError);
  const tape = useTokenTape(token?.mint ?? null, token?.quoteMint ?? null, pool.data?.poolId ?? token?.poolId ?? null, {
    enabled: tapeReady,
    source: tapeSource,
  });

  const poolAccounts = useMemo(() => {
    const accounts = [pool.data?.vaultBase, pool.data?.poolId ?? token?.poolId];
    return accounts.filter((value): value is string => Boolean(value));
  }, [pool.data?.vaultBase, pool.data?.poolId, token?.poolId]);
  const holders = useAllHolders(token?.mint, mintInfo.data?.program, poolAccounts);
  // The Network token's burn ledger: the tracker's, or stonkfun's flywheel burns via stonkfun.
  const trackerPlan = ledgerForMint(useBurnPlan(agentMint && !viaStonkfun), mint);
  const stonkfunPlan = useStonkfunBurnPlan(mint, mintInfo.data?.supply ?? null, viaStonkfun);
  const burnPlan = viaStonkfun ? stonkfunPlan : trackerPlan;

  const creatorPct = useMemo(() => {
    const creator = pool.data?.creator ?? token?.creator;
    if (!holders.data || !creator) return null;
    const held = holders.data.holders.filter(h => h.owner === creator && !h.isPool).reduce((s, h) => s + h.amount, 0);
    return holders.data.supply > 0 ? (held / holders.data.supply) * 100 : null;
  }, [holders.data, pool.data?.creator, token?.creator]);

  if (route && route.segment === null) {
    // The shell itself, or no segment at all: nothing to show.
    notFound();
  }

  if (route && !mint) {
    return (
      <Container>
        <div className="py-12 text-center text-text-secondary">Invalid token address.</div>
        <Link href="/tokens" className="text-accent-green hover:underline">
          Back to Agents
        </Link>
      </Container>
    );
  }

  if (route && !token && isError && !isLoading) {
    return (
      <Container>
        <div className="py-12 text-center text-text-secondary" data-testid="token-detail-unavailable">
          Couldn&apos;t load this token right now. Retrying.
        </div>
        <Link href="/tokens" className="text-accent-green hover:underline">
          Back to Agents
        </Link>
      </Container>
    );
  }

  if (!route || (!token && (isLoading || !isFetched))) {
    return (
      <Container>
        <div className="flex flex-col gap-4 py-6" data-testid="token-detail-loading">
          <div className="h-40 w-full animate-pulse rounded-xl bg-bg-secondary" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="h-[420px] animate-pulse rounded-xl bg-bg-secondary" />
            <div className="h-80 animate-pulse rounded-xl bg-bg-secondary" />
          </div>
        </div>
      </Container>
    );
  }

  if (!token) {
    notFound();
  }

  const quoteSymbol = token.quoteSymbol ?? (isLaunch ? (launchConfig.data?.quote.symbol ?? null) : null);
  const configTarget = isLaunch && launchConfig.data ? raiseUnits(launchConfig.data.raise, launchConfig.data.quote) : null;
  const configSupply =
    isLaunch && launchConfig.data ? Number(launchConfig.data.curve.supply) / 10 ** launchConfig.data.curve.baseDecimals : null;
  const supply = pool.data?.supplyBase ?? mintInfo.data?.supply ?? configSupply;
  const poolError = pool.error != null ? describeChainError(pool.error) : null;
  const listing = toListing(token);
  const holderRows = holders.data?.holders ?? [];
  const holderCount = holders.data && !holders.data.capped ? holders.data.holders.filter(h => !h.isPool).length : null;
  const external = token.source === 'external';
  // The pool names the created supply; without one the environment may, and stonkfun's ledger reads it back off the mint.
  const createdSupply =
    pool.data && pool.data.supplyBase > 0
      ? pool.data.supplyBase
      : (AGENT_TOTAL_SUPPLY ?? (viaStonkfun && burnPlan.status === 'ready' && burnPlan.data.total > 0 ? burnPlan.data.total : null));
  const stonkfunHref = viaStonkfun ? stonkfunTokenUrl(token.mint) : null;

  const statsGrid = (
    <TokenDetailStats
      token={token}
      pool={pool.data}
      quoteSymbol={quoteSymbol}
      quoteUsd={quoteUsdValue}
      solUsd={launchConfig.data?.fee.solUsd ?? null}
      denomination={denomination}
      lastPrice={tape.lastPrice}
      // No tape via stonkfun: the 24h figures are stonkfun's own.
      tape={!viaStonkfun && (tape.trades.length > 0 || !tape.isLoading) ? tape.stats : undefined}
      holderCount={holderCount}
      creatorPct={creatorPct}
      revenue={revenue.data ?? null}
      liquidityUsd={viaStonkfun ? (stonkfun.data?.market.liquidityUsd ?? null) : null}
    />
  );

  return (
    <div className="flex min-h-0 flex-col pb-24" data-testid="token-detail-page" data-source={token.source}>
      <Container className="py-4">
        <Link href="/tokens" className="mb-4 inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text-primary">
          <Icon name="chevron-left" size="sm" /> Agents
        </Link>

        <TokenDetailHeader
          token={token}
          pool={pool.data}
          quoteSymbol={quoteSymbol}
          quoteUsd={quoteUsdValue}
          metadata={metadata.data ?? null}
          lastPrice={tape.lastPrice}
          denomination={denomination}
          onDenominationChange={setDenomination}
          venue={stonkfunHref ? { name: STONKFUN_NAME, href: stonkfunHref } : null}
        >
          <div className="hidden md:block">{statsGrid}</div>
        </TokenDetailHeader>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-none">
            <div
              className="flex gap-1 overflow-x-auto border-b border-border-default"
              role="tablist"
              aria-label="Token sections"
              data-testid="token-main-tabs"
            >
              {/* Discussion is the token's room on the board; only a token launched here has one. */}
              {MAIN_TABS.filter(option => option.id !== 'discussion' || isLaunch).map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === option.id}
                  onClick={() => setTab(option.id)}
                  data-testid={`main-tab-${option.id}`}
                  className={cn(
                    'min-h-[44px] shrink-0 border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors',
                    tab === option.id
                      ? 'border-accent-green text-accent-green'
                      : 'border-transparent text-text-secondary hover:text-text-primary',
                  )}
                >
                  {option.label}
                  {option.id === 'trades' && tape.trades.length > 0 && (
                    <span className="ml-1.5 text-[11px] text-text-tertiary">{tape.trades.length}</span>
                  )}
                  {option.id === 'holders' && holderRows.length > 0 && (
                    <span className="ml-1.5 text-[11px] text-text-tertiary">{holderRows.length}</span>
                  )}
                </button>
              ))}
            </div>

            {external && pool.isError && !pool.data && (
              <p className="mb-3 text-xs text-accent-red" data-testid="agent-pool-error">
                Could not read the ${token.symbol} pool on this network{poolError ? `: ${poolError}` : '.'} The figures below stay
                empty until it answers.
              </p>
            )}
            {tab === 'chart' && viaStonkfun && (
              // No trades or candles in stonkfun's API: the chart is DexScreener's, keyed by the mint (the venue picks the live pair).
              <TokenChartIframe mint={token.mint} poolId={null} quoteMint={token.quoteMint} />
            )}
            {tab === 'chart' && !viaStonkfun && (
              <ChartSection
                mint={token.mint}
                poolId={pool.data?.poolId ?? token.poolId}
                quoteMint={token.quoteMint}
                quoteSymbol={quoteSymbol}
                quoteUsd={quoteUsdValue}
                supply={supply}
                trades={tape.trades}
                tapeLoading={tape.isLoading}
                tapeReconnecting={tape.reconnecting}
                candleSource={isLaunch ? 'tracker' : 'tape'}
                change24hPct={token.metrics24h.priceChange24hPct}
                denomination={denomination}
                onDenominationChange={setDenomination}
                poolOpen={Boolean(pool.data && !pool.data.graduated)}
                tokenSymbol={token.symbol}
                feeBps={token.transferFeeBps}
                explorerHref={explorerUrl('token', token.mint)}
              />
            )}
            {tab === 'trades' && stonkfunHref && (
              <div className="rounded-xl border border-border-default bg-bg-secondary p-4" data-testid="trades-on-stonkfun">
                <p className="text-sm text-text-tertiary">
                  ${token.symbol} trades on {STONKFUN_NAME}; the tape is listed there.
                </p>
                <a
                  href={stonkfunHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border-default bg-bg-tertiary px-4 text-sm font-semibold text-text-secondary no-underline transition-colors hover:border-border-hover hover:text-text-primary"
                  data-testid="trades-on-stonkfun-link"
                >
                  Trades on {STONKFUN_NAME} <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
            {tab === 'trades' && !stonkfunHref && (
              <LiveTransactions
                trades={tape.trades}
                isLoading={tape.isLoading}
                isFetching={tape.isFetching}
                error={tape.error}
                reconnecting={tape.reconnecting}
                refetch={tape.refetch}
                tokenSymbol={token.symbol}
                quoteSymbol={quoteSymbol}
                quoteUsd={quoteUsdValue}
                denomination={denomination}
              />
            )}
            {tab === 'holders' && (
              <TokenHolders
                holders={holderRows}
                supply={holders.data?.supply ?? supply}
                capped={holders.data?.capped ?? false}
                isLoading={holders.isLoading || (mintInfo.isLoading && !holders.data)}
                error={holders.error instanceof Error ? holders.error : mintInfo.error instanceof Error ? mintInfo.error : null}
                reconnecting={(holders.isError && holders.data !== undefined) || (mintInfo.isError && mintInfo.data !== undefined)}
                tokenSymbol={token.symbol}
                creator={pool.data?.creator ?? token.creator}
              />
            )}
            {tab === 'discussion' && isLaunch && <TokenDiscussion mint={token.mint} symbol={token.symbol} />}
            {tab === 'info' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <TokenPanel
                  token={token}
                  mintInfo={mintInfo.data ?? null}
                  metadata={metadata.data ?? null}
                  quoteSymbol={quoteSymbol}
                  configSupply={configSupply}
                />
                <PoolPanel
                  token={token}
                  pool={pool.data}
                  poolError={poolError}
                  quoteSymbol={quoteSymbol}
                  configTarget={configTarget}
                  configCurveType={isLaunch ? (launchConfig.data?.curve.curveType ?? null) : null}
                />
              </div>
            )}
            <div className="md:hidden">{statsGrid}</div>

            {agentMint && (
              <NetworkTokenSection
                token={token}
                createdSupply={createdSupply}
                currentSupply={mintInfo.data?.supply ?? null}
                burnPlan={burnPlan}
                venue={stonkfunHref ? { name: STONKFUN_NAME, href: stonkfunHref } : null}
              />
            )}
          </div>

          <aside className="contents xl:sticky xl:top-20 xl:flex xl:flex-col xl:gap-6">
            <div className="order-1 xl:order-none">
              <TokenTrading
                token={token}
                pool={pool.data}
                poolError={poolError}
                poolLoading={pool.isLoading || (isLaunch && !programId && launchConfig.isLoading)}
                quoteSymbol={quoteSymbol}
                quoteUsd={quoteUsdValue}
                onTraded={() => {
                  void pool.refetch();
                  tape.refetch();
                }}
                externalHref={external ? AGENT_EXTERNAL_BUY_URL : null}
                // Via stonkfun the token is bought and sold through Jupiter in the app; the link above stays as a second door.
                inAppSwap={viaStonkfun}
              />
            </div>
            <MobileFold label="Curve & fees" className="order-3 xl:order-none">
              <BondingCurveBlock
                token={token}
                pool={pool.data}
                quoteSymbol={quoteSymbol}
                quoteUsd={quoteUsdValue}
                configTarget={configTarget}
              />
            </MobileFold>
          </aside>
        </div>
      </Container>

      {listing.peer_id && <TokenHolderChat token={listing} />}
    </div>
  );
}
