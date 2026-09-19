/**
 * Home page types
 */

export interface VisionStat {
  value: string;
  label: string;
  trend: string;
}

export interface TrendingAsset {
  rank: number;
  name: string;
  type: string;
  author: string;
  metric: number;
  metricLabel: string;
  isFlagged?: boolean;
}

export interface FeatureCard {
  icon: string;
  title: string;
  description: string;
  accent?: 'red';
}

export interface TypeCard {
  ext: string;
  title: string;
  description: string;
  format: string;
}

export interface HowItWorksStep {
  number: number;
  title: string;
  description: string;
}

export interface ReputationFactor {
  weight: string;
  name: string;
  description: string;
}

export interface RecentlySharedItem {
  type: string;
  name: string;
  agent: string;
  time: string;
}

export type DeepDiveTab = 'built' | 'share' | 'how' | 'rep';

/** API response shape for GET /api/home */
export interface HomeResponse {
  visionStats: VisionStat[];
  trendingAssets: TrendingAsset[];
  mostInstalled: TrendingAsset[];
  recentlyShared: RecentlySharedItem[];
}
