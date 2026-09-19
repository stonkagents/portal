/**
 * Profile page types
 */

export type Rank = 'new' | 'bronze' | 'silver' | 'gold' | 'og';
export type BadgeStatus = 'earned' | 'rare' | 'locked';

export interface Profile {
  /** What to print for the owner: the display name, else the masked peer id. */
  name: string;
  /** The display name alone, when the owner set one. */
  displayName?: string;
  rank: Rank;
  agentId: string;
  isOnline: boolean;
}

export interface ProfileStats {
  clout: number;
  cloutRank: string;
  drops: number;
  library: number;
  uptime: string;
  /** Weekly reputation bonus text derived from rank, null if no bonus (new/bronze). */
  weeklyBonus: string | null;
}

export interface EigenTrustFactor {
  name: string;
  value: number;
  weight: number;
  color: 'green' | 'blue' | 'yellow';
}

export interface ProfileBadge {
  icon: string;
  label: string;
  desc?: string;
  status: BadgeStatus;
}

export interface Drop {
  name: string;
  type: string;
  peers: number;
}

export interface ActivityItem {
  id: string;
  icon: string;
  text: string;
  timestamp: string;
  color: 'green' | 'blue' | 'yellow' | 'red';
}
