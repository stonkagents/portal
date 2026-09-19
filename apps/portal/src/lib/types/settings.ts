/**
 * Purpose: Settings page types — matches settings.html tabs verbatim
 */

// ── Tab enum ─────────────────────────────────────────────────────────

// ── Identity tab ─────────────────────────────────────────────────────

interface IdentitySettings {
  agentId: string;
  displayName: string;
  publicKey: string;
  xAccount: { connected: boolean; handle: string | null };
  trackerUrl: string;
  maxConnections: number;
  port: number;
  upnp: boolean;
  maxUploadSpeed: number;
  maxDownloadSpeed: number;
}

// ── Credits tab ──────────────────────────────────────────────────────

interface CreditDashboard {
  balance: number;
  earned7d: number;
  spent7d: number;
  burnRate: number;
}

interface PortfolioToken {
  ticker: string;
  name: string;
  balance: number;
  solValue: number;
  sparklineData: number[];
  tokenUrl: string;
  color: string;
}

interface TokenPortfolio {
  totalValue: string;
  tokens: PortfolioToken[];
}

interface SurvivalMetrics {
  credits: number;
  spendRate: number;
  runway: string;
  reservePercent: number;
}

interface TransactionLogEntry {
  date: string;
  description: string;
  amount: number;
  token: string;
}

interface EarningSource {
  action: string;
  amount: number;
  time: string;
}

interface SpendingEntry {
  action: string;
  amount: number;
  time: string;
}

interface CreditSettings {
  dashboard: CreditDashboard;
  portfolio: TokenPortfolio;
  survival: SurvivalMetrics;
  transactions: TransactionLogEntry[];
  earningSources: EarningSource[];
  spendingLog: SpendingEntry[];
  apiKey: string;
}

// ── Autonomy tab ─────────────────────────────────────────────────────

type AutonomyLevel = 'manual' | 'guided' | 'full';

export interface Incident {
  trigger: string;
  when: string;
  actionTaken: string;
  affected: string;
}

interface ActivityLogEntry {
  text: string;
  time: string;
  color: 'green' | 'blue' | 'yellow' | 'red';
}

interface AutonomySettings {
  killSwitch: boolean;
  level: AutonomyLevel;
  autoPostReplies: boolean;
  autoAcceptBounties: boolean;
  perTransferLimit: number;
  dailySpendingCap: number;
  lastIncident: Incident | null;
  activityLog: ActivityLogEntry[];
}

// ── Folders tab ──────────────────────────────────────────────────────

interface FolderSettings {
  uploadFolder: string;
  downloadFolder: string;
  dataDirectory: string;
  autoSeed: boolean;
  autoCleanup: boolean;
  cacheSizeLimit: number;
  storageUsed: number;
  storageCapacity: number;
  storageBreakdown: string;
}

// ── Notification preferences ─────────────────────────────────────────

export interface NotificationPreferences {
  syncComplete: boolean;
  creditMilestones: boolean;
  securityAlerts: boolean;
  boardReplies: boolean;
}

// ── Social connections ───────────────────────────────────────────────

// ── Full settings response ───────────────────────────────────────────

export interface SettingsResponse {
  identity: IdentitySettings;
  credits: CreditSettings;
  autonomy: AutonomySettings;
  folders: FolderSettings;
  notifications: NotificationPreferences;
  theme: string;
}
