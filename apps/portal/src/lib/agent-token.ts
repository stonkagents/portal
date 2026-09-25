import { stonkfunTokenUrl } from '@/lib/api/stonkfun';
import { WRAPPED_SOL_MINT } from '@/lib/launchlab/constants';
import { STONK_MINT } from '@/lib/launchlab/quote-catalog';

/**
 * The Network's own token ($AGENT): mint, pool, buy link and identity for the
 * pinned card (home page, right after the hero; top of the Agent Tokens page)
 * and the detail page.
 *
 * $AGENT is launched on stonk.fun — a Raydium LaunchLab pool under stonk.fun's
 * platform config, quoted in SOL — not on this platform. There is no tracker
 * launch record for it: every number the site shows for it is read from that
 * pool, the mint and the holders on chain (`useAgentToken`), or from the
 * tracker's burn ledger. Nothing is sampled or assumed.
 *
 * The mint, the pool and the buy URL are read from the environment at build
 * time (`NEXT_PUBLIC_*` values are inlined by Next). Deliberately NOT part of
 * `src/config` — nothing that shapes a launch lives there.
 *
 * An empty `NEXT_PUBLIC_AGENT_MINT` means the token is not configured for
 * this build (production before the launch): `AGENT_CONFIGURED` is false,
 * `AGENT_MINT` is null, every $AGENT surface renders its "coming soon" state
 * and nothing reads a pool, the mint, the holders or a burn ledger. Setting
 * the mint (and the pool) later restores the full card with no code change.
 */

/**
 * Next inlines a public value only where `process.env.NEXT_PUBLIC_X` is
 * written out in full; a name looked up on `process.env` through a variable
 * is left as is and reads undefined in the browser, where `process.env` is
 * an empty polyfill. So the burn-schedule and vesting values are listed here
 * in full, once, and the parsers below read this object by default.
 */
const PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: process.env.NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT,
  NEXT_PUBLIC_AGENT_BURN_STEP_PCT: process.env.NEXT_PUBLIC_AGENT_BURN_STEP_PCT,
  NEXT_PUBLIC_AGENT_BURN_INTERVAL: process.env.NEXT_PUBLIC_AGENT_BURN_INTERVAL,
  NEXT_PUBLIC_AGENT_BURN_START: process.env.NEXT_PUBLIC_AGENT_BURN_START,
  NEXT_PUBLIC_AGENT_TEAM_PCT: process.env.NEXT_PUBLIC_AGENT_TEAM_PCT,
  NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE: process.env.NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE,
  NEXT_PUBLIC_AGENT_VESTING_CLIFF_DATE: process.env.NEXT_PUBLIC_AGENT_VESTING_CLIFF_DATE,
  NEXT_PUBLIC_AGENT_VESTING_CADENCE: process.env.NEXT_PUBLIC_AGENT_VESTING_CADENCE,
  NEXT_PUBLIC_AGENT_VESTING_MONTHS: process.env.NEXT_PUBLIC_AGENT_VESTING_MONTHS,
  NEXT_PUBLIC_AGENT_VESTING_URL: process.env.NEXT_PUBLIC_AGENT_VESTING_URL,
};

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** The $AGENT mint address, or null when the environment names none (the token is not live yet). */
export const AGENT_MINT: string | null = nonEmpty(process.env.NEXT_PUBLIC_AGENT_MINT);

/** True when the build names the $AGENT mint. False renders "coming soon" everywhere the token would show. */
export const AGENT_CONFIGURED: boolean = AGENT_MINT != null;

/* ── Source ─────────────────────────────────────────────────────────────
 * Where the Network token's figures are read from. `pool` (the default)
 * reads the LaunchLab pool on chain plus the tracker's burn ledger, as
 * before. `stonkfun` reads stonkfun's public API instead: price, market
 * cap, volume, liquidity and the flywheel's burns come from there, the
 * chart is DexScreener's embed, and the token is bought and sold in the app
 * through Jupiter's Swap API (Jupiter's own page is the second door). The
 * holders still come off the chain either way. */

export type AgentTokenSource = 'pool' | 'stonkfun';

/** `stonkfun` when the environment says so (any case); `pool` for anything else. Exported for tests. */
export function agentSourceFromEnv(value: string | undefined): AgentTokenSource {
  return nonEmpty(value)?.toLowerCase() === 'stonkfun' ? 'stonkfun' : 'pool';
}

/** The configured source for the Network token. */
export const AGENT_SOURCE: AgentTokenSource = agentSourceFromEnv(process.env.NEXT_PUBLIC_AGENT_SOURCE);

/** True when the Network token is read from stonkfun's API. */
export const AGENT_VIA_STONKFUN = AGENT_SOURCE === 'stonkfun';

/**
 * The $AGENT LaunchLab pool, when the environment names it. Unset: the pool
 * PDA is derived from the mint and the quote on the cluster's LaunchLab program.
 */
export const AGENT_POOL_ID: string | null = nonEmpty(process.env.NEXT_PUBLIC_AGENT_POOL);

/**
 * The quote $AGENT's pool raises in. stonk.fun pairs every launch with $STONK,
 * so the default is the $STONK mint; a devnet build emulating the launch under a
 * second platform config points this at whatever its stand-in pool was created with.
 */
export const AGENT_QUOTE_MINT: string = nonEmpty(process.env.NEXT_PUBLIC_AGENT_QUOTE_MINT) ?? STONK_MINT;

/** What the network token is paired with, as the UI names it: always $STONK, whatever a stand-in pool holds. */
export const AGENT_PAIRED_WITH = 'STONK';

/** Best label for the quote without a tracker record to name it. */
export function agentQuoteSymbol(quoteMint: string = AGENT_QUOTE_MINT): string | null {
  if (quoteMint === WRAPPED_SOL_MINT) return 'SOL';
  if (quoteMint === STONK_MINT) return 'STONK';
  return null;
}

/** The token's page on stonkfun, when that is the source. */
export const AGENT_STONKFUN_URL: string | null = AGENT_VIA_STONKFUN && AGENT_MINT ? stonkfunTokenUrl(AGENT_MINT) : null;

/** Jupiter's swap page with the pair pre-filled: quote in, network token out. */
export function jupiterSwapUrl(inputMint: string, outputMint: string, base: string = 'https://jup.ag'): string {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${root}/swap/${inputMint}-${outputMint}`;
}

/**
 * Jupiter's swap page for a stonkfun-sourced network token, quote -> token
 * pre-filled: the second door next to the in-app swap (which routes through
 * Jupiter's API for the same pair). Null for the pool source.
 */
export const AGENT_JUPITER_URL: string | null =
  AGENT_VIA_STONKFUN && AGENT_MINT ? jupiterSwapUrl(AGENT_QUOTE_MINT, AGENT_MINT, process.env.NEXT_PUBLIC_JUPITER_URL || 'https://jup.ag') : null;

/**
 * An external venue for the network token: `NEXT_PUBLIC_AGENT_BUY_URL` when
 * configured, else Jupiter's page via stonkfun, else nothing.
 */
export const AGENT_EXTERNAL_BUY_URL: string | null = nonEmpty(process.env.NEXT_PUBLIC_AGENT_BUY_URL) ?? AGENT_JUPITER_URL;

/** The token's page: the same detail page as every other token (trailingSlash). Null until the mint is configured. */
export const AGENT_PAGE_HREF: string | null = AGENT_MINT ? `/tokens/${AGENT_MINT}/` : null;

/** The token page, landing on its trade panel. Null until the mint is configured. */
export const AGENT_TRADE_HREF: string | null = AGENT_PAGE_HREF ? `${AGENT_PAGE_HREF}#trade` : null;

/**
 * Where "Buy $AGENT" goes: the configured venue when `NEXT_PUBLIC_AGENT_BUY_URL`
 * names one; via stonkfun, the in-app swap on the token page; else the token
 * page. Null while the mint is not configured: the card has no buy button then.
 */
export const AGENT_BUY_HREF: string | null =
  nonEmpty(process.env.NEXT_PUBLIC_AGENT_BUY_URL) ?? (AGENT_VIA_STONKFUN ? AGENT_TRADE_HREF : AGENT_PAGE_HREF);

/** True for the Network's own mint. Never true while the mint is not configured. */
export function isAgentMint(mint: string | null | undefined): boolean {
  return AGENT_MINT != null && mint === AGENT_MINT;
}

/* ── Network-token facts ────────────────────────────────────────────────
 * The supply the mint was created with is read off the pool (`supplyBase`);
 * the environment can state it for a build that cannot read the pool. Every
 * live figure (current supply, burns, holders) is read from the chain or the
 * tracker's ledger. Nothing here is a default that looks like a fact. */

function numberEnv(value: string | undefined): number | null {
  const text = nonEmpty(value);
  if (text == null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Whole $AGENT the mint was created with, when the environment states it; the pool's own supply field is preferred. */
export const AGENT_TOTAL_SUPPLY: number | null = numberEnv(process.env.NEXT_PUBLIC_AGENT_TOTAL_SUPPLY);

/* ── Burn schedule ──────────────────────────────────────────────────────
 * The buyback-and-burn plan, read from the environment only when every part
 * of it is set, so the panel draws a plan the operator actually wrote down.
 * The tracker's burnplan, once it exists, overrides what the schedule derives. */

const DURATION_UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 };

/**
 * "1d", "12h", "30m", "90s", "2w", or an ISO-8601 duration ("P1D", "PT1H",
 * "P1DT12H", "PT30M"). Null for anything else or a zero length.
 */
export function parseDuration(text: string | undefined | null): number | null {
  const value = nonEmpty(text ?? undefined)?.toLowerCase();
  if (!value) return null;
  const short = /^(\d+(?:\.\d+)?)\s*([smhdw])$/.exec(value);
  if (short) {
    const ms = Number(short[1]) * DURATION_UNITS[short[2]];
    return ms > 0 ? ms : null;
  }
  const iso =
    /^p(?:(\d+(?:\.\d+)?)w)?(?:(\d+(?:\.\d+)?)d)?(?:t(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?)?$/.exec(value);
  if (!iso) return null;
  const [, w, d, h, m, sec] = iso;
  const ms =
    Number(w ?? 0) * DURATION_UNITS.w +
    Number(d ?? 0) * DURATION_UNITS.d +
    Number(h ?? 0) * DURATION_UNITS.h +
    Number(m ?? 0) * DURATION_UNITS.m +
    Number(sec ?? 0) * DURATION_UNITS.s;
  return ms > 0 ? ms : null;
}

/** "1d" / "12h" / "30m" for a duration, the largest whole unit that fits. */
export function formatDuration(ms: number): string {
  for (const unit of ['w', 'd', 'h', 'm', 's'] as const) {
    if (ms >= DURATION_UNITS[unit] && ms % DURATION_UNITS[unit] === 0) return `${ms / DURATION_UNITS[unit]}${unit}`;
  }
  return `${Math.round(ms / 1000)}s`;
}

export interface BurnScheduleConfig {
  /** Share of supply the plan burns in total, 0–100. */
  totalPct: number;
  /** Share of supply each burn takes, 0–100. */
  stepPct: number;
  /** Time between burns. */
  intervalMs: number;
  /** ISO datetime of the first burn. Null: the launch time, when one is known. */
  start: string | null;
}

/** The schedule from the environment, or null unless the total, the step and the interval are all set. Exported for tests. */
export function burnScheduleFromEnv(env: Record<string, string | undefined> = PUBLIC_ENV): BurnScheduleConfig | null {
  const totalPct = numberEnv(env.NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT);
  const stepPct = numberEnv(env.NEXT_PUBLIC_AGENT_BURN_STEP_PCT);
  const intervalMs = parseDuration(env.NEXT_PUBLIC_AGENT_BURN_INTERVAL);
  if (totalPct == null || totalPct <= 0 || stepPct == null || stepPct <= 0 || intervalMs == null) return null;
  return { totalPct, stepPct, intervalMs, start: nonEmpty(env.NEXT_PUBLIC_AGENT_BURN_START) };
}

/** The configured plan, or null when the environment states none. */
export const AGENT_BURN_SCHEDULE: BurnScheduleConfig | null = burnScheduleFromEnv();

export interface BurnSchedule {
  /** Whole tokens the plan burns in total. */
  plannedTokens: number;
  /** Whole tokens per burn. */
  stepTokens: number;
  /** Burns the plan takes. */
  plannedBurns: number;
  /** Burns the chain shows done: burned so far over the step, never past the plan. */
  burnsDone: number;
  /** Planned share of the supply, 0–1. */
  plannedFraction: number;
  /** Burned so far over the plan, 0–1. */
  progress: number;
  /** Epoch ms of the first burn, or null when no start is known. */
  startAt: number | null;
  /** Epoch ms of the next scheduled burn: the first tick at or after now, or null when unknown or complete. */
  nextAt: number | null;
  intervalMs: number;
  complete: boolean;
}

/** The schedule for a supply, what the chain says is burned, and the clock. Pure. */
export function burnSchedule(
  input: { totalSupply: number; burned: number | null; start?: string | null; now?: number },
  cfg: BurnScheduleConfig,
): BurnSchedule {
  const now = input.now ?? Date.now();
  const plannedTokens = (input.totalSupply * cfg.totalPct) / 100;
  const stepTokens = (input.totalSupply * cfg.stepPct) / 100;
  const plannedBurns = stepTokens > 0 ? Math.max(0, Math.round(plannedTokens / stepTokens)) : 0;
  const burned = input.burned ?? 0;
  const burnsDone = stepTokens > 0 ? Math.min(plannedBurns, Math.floor(burned / stepTokens)) : 0;
  const progress = plannedTokens > 0 ? Math.min(1, burned / plannedTokens) : 0;
  const complete = plannedBurns > 0 && burnsDone >= plannedBurns;
  const startText = cfg.start ?? input.start ?? null;
  const startAt = startText ? Date.parse(startText) : NaN;
  let nextAt: number | null = null;
  if (Number.isFinite(startAt) && cfg.intervalMs > 0 && !complete) {
    const ticks = now <= startAt ? 0 : Math.ceil((now - startAt) / cfg.intervalMs);
    nextAt = startAt + ticks * cfg.intervalMs;
    if (plannedBurns > 0 && ticks >= plannedBurns) nextAt = null;
  }
  return {
    plannedTokens,
    stepTokens,
    plannedBurns,
    burnsDone,
    plannedFraction: Math.min(1, cfg.totalPct / 100),
    progress,
    startAt: Number.isFinite(startAt) ? startAt : null,
    nextAt,
    intervalMs: cfg.intervalMs,
    complete,
  };
}

/* ── Team vesting ───────────────────────────────────────────────────────
 * The team's share and the stream it locks into, from the environment only
 * when the whole plan is written down there. Nothing is rendered otherwise. */

export type VestingCadence = 'daily' | 'weekly' | 'monthly';

export interface VestingConfig {
  /** Share of supply the team holds, 0–100. */
  teamPct: number;
  /** ISO date the allocation locks into the stream. */
  lockDate: string;
  /** ISO date unlocks begin. */
  cliffDate: string;
  cadence: VestingCadence;
  /** Months of unlocks after the cliff. */
  months: number;
  /** Streamflow contract link, once the stream exists. */
  url: string | null;
}

function cadenceEnv(value: string | undefined): VestingCadence | null {
  const v = nonEmpty(value)?.toLowerCase();
  return v === 'daily' || v === 'weekly' || v === 'monthly' ? v : null;
}

/** The vesting plan from the environment, or null unless every part of it is set. Exported for tests. */
export function vestingFromEnv(env: Record<string, string | undefined> = PUBLIC_ENV): VestingConfig | null {
  const teamPct = numberEnv(env.NEXT_PUBLIC_AGENT_TEAM_PCT);
  const lockDate = nonEmpty(env.NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE);
  const cliffDate = nonEmpty(env.NEXT_PUBLIC_AGENT_VESTING_CLIFF_DATE);
  const cadence = cadenceEnv(env.NEXT_PUBLIC_AGENT_VESTING_CADENCE);
  const months = numberEnv(env.NEXT_PUBLIC_AGENT_VESTING_MONTHS);
  if (teamPct == null || teamPct <= 0 || !lockDate || !cliffDate || !cadence || months == null || months <= 0) return null;
  if (!Number.isFinite(Date.parse(lockDate)) || !Number.isFinite(Date.parse(cliffDate))) return null;
  return { teamPct, lockDate, cliffDate, cadence, months, url: nonEmpty(env.NEXT_PUBLIC_AGENT_VESTING_URL) };
}

/** The configured plan, or null when the environment states none. */
export const AGENT_VESTING: VestingConfig | null = vestingFromEnv();

/** Share of supply bought at launch, when the environment states it. */
export const AGENT_LAUNCH_BUY_PCT: number | null = numberEnv(process.env.NEXT_PUBLIC_AGENT_LAUNCH_BUY_PCT);

/** Streamflow vesting stream URL for the team allocation, once one exists. */
export const TEAM_VESTING_STREAM_URL: string | null = AGENT_VESTING?.url ?? null;

/** "Q1 2027" for an epoch ms, in UTC. */
export function quarterLabel(ms: number): string {
  const d = new Date(ms);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

export type VestingPhase = 'before-lock' | 'locked' | 'unlocking' | 'unlocked';

export interface VestingTimeline {
  lockAt: number;
  cliffAt: number;
  /** Full unlock: the cliff plus the unlock span. */
  endAt: number;
  phase: VestingPhase;
  /** Left edge of the track: today, or the lock date once it has passed. */
  domainStart: number;
  /** 0–1 positions on the track. */
  todayFrac: number;
  lockFrac: number;
  cliffFrac: number;
  /** Share of the allocation unlocked so far, stepped by the cadence, 0–1. */
  unlockedFrac: number;
  /** Whole days until the lock, or 0 once locked. */
  daysToLock: number;
  /** Whole days until the cliff, or 0 once past it. */
  daysToCliff: number;
  /** "Q1 2027": the quarter the allocation stays locked through. */
  lockedUntilLabel: string;
  cadence: VestingCadence;
}

const CADENCE_MS: Record<VestingCadence, number> = {
  daily: DURATION_UNITS.d,
  weekly: DURATION_UNITS.w,
  monthly: 30.4375 * DURATION_UNITS.d,
};

/** Where the team allocation is on its way to unlocked. Pure. */
export function vestingTimeline(cfg: VestingConfig, now: number = Date.now()): VestingTimeline {
  const lockAt = Date.parse(cfg.lockDate);
  const cliffAt = Math.max(lockAt, Date.parse(cfg.cliffDate));
  const end = new Date(cliffAt);
  end.setUTCMonth(end.getUTCMonth() + Math.max(0, Math.round(cfg.months)));
  const endAt = Math.max(cliffAt + 1, end.getTime());
  const phase: VestingPhase = now < lockAt ? 'before-lock' : now < cliffAt ? 'locked' : now < endAt ? 'unlocking' : 'unlocked';
  const domainStart = Math.min(now, lockAt);
  const span = Math.max(1, endAt - domainStart);
  const frac = (t: number) => Math.min(1, Math.max(0, (t - domainStart) / span));
  const cadenceMs = CADENCE_MS[cfg.cadence];
  const unlockSpan = Math.max(1, endAt - cliffAt);
  const unlockedFrac =
    phase === 'unlocked'
      ? 1
      : phase === 'unlocking'
        ? Math.min(1, (Math.floor((now - cliffAt) / cadenceMs) * cadenceMs) / unlockSpan)
        : 0;
  const days = (t: number) => Math.max(0, Math.ceil((t - now) / DURATION_UNITS.d));
  return {
    lockAt,
    cliffAt,
    endAt,
    phase,
    domainStart,
    todayFrac: frac(now),
    lockFrac: frac(lockAt),
    cliffFrac: frac(cliffAt),
    unlockedFrac,
    daysToLock: days(lockAt),
    daysToCliff: days(cliffAt),
    // A cliff on a quarter boundary reads as "locked until" the quarter before it.
    lockedUntilLabel: quarterLabel(cliffAt - 1),
    cadence: cfg.cadence,
  };
}

/**
 * Tokens burned so far: the created supply minus what the mint reports now.
 * Null until both are known; never below zero.
 */
export function burnedSoFar(currentSupply: number | null | undefined, totalSupply: number | null | undefined): number | null {
  if (currentSupply == null || !Number.isFinite(currentSupply) || totalSupply == null || !Number.isFinite(totalSupply)) return null;
  return Math.max(0, totalSupply - currentSupply);
}

/**
 * The supply the mint was created with, read back from what it reports now
 * plus what a burn ledger says is gone. Null until both are known.
 */
export function createdSupplyFromBurns(currentSupply: number | null | undefined, burned: number | null | undefined): number | null {
  if (currentSupply == null || !Number.isFinite(currentSupply) || burned == null || !Number.isFinite(burned)) return null;
  return currentSupply + Math.max(0, burned);
}

export interface FeaturedAgentToken {
  mint: string;
  name: string;
  symbol: string;
  /** Quote the pool raises in. */
  quoteSymbol: string;
}

/**
 * The Network's token identity for the pinned card. Every number on the card
 * comes from the chain (`useAgentToken`), never from here. Null when the build
 * names no mint: the card renders its "coming soon" state for a null token.
 */
export function featuredAgentToken(mint: string): FeaturedAgentToken;
export function featuredAgentToken(mint?: string | null): FeaturedAgentToken | null;
export function featuredAgentToken(mint: string | null = AGENT_MINT): FeaturedAgentToken | null {
  if (mint == null) return null;
  return { mint, name: 'StonkAgents', symbol: 'AGENT', quoteSymbol: agentQuoteSymbol() ?? 'SOL' };
}
