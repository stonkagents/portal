/**
 * Purpose: Agent Tokens types (tokens launched against $STONK on the StonkAgents launchpad)
 */

type TokenStatus = 'bonding' | 'migrated';

export interface Token {
  id: string;
  name: string;
  symbol: string;
  image: string | null;
  /** Only available from mock data — backend does not serve descriptions */
  description?: string;
  creator: string;
  status: TokenStatus;
  bondingCurveProgress: number;
  solRaised: number;
  holders: number;
  createdAt: string;
  /** Only available from mock data — backend does not serve tags */
  tags?: string[];
  /** Only available from mock data — backend does not serve reactions */
  reactions?: {
    fire: number;
    rocket: number;
    crab: number;
  };
  tokenUrl: string;
  /** Only available from mock data — backend does not serve color */
  color?: string;
}

export interface TokenPerformance {
  /** Current price in SOL */
  price: number;
  /** 24h percentage change (-100 to +Infinity) */
  priceChange24h: number;
  /** Current holder count */
  holders: number;
  /** 24h trading volume in SOL */
  volume24h: number;
  /** 24 data points (hourly) for sparkline chart */
  sparklineData: number[];
  /** Bonding curve completion 0-100 */
  bondingCurveProgress: number;
}
