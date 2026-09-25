/**
 * Purpose: Backend response types matching exact Go JSON shapes.
 * Source of truth: agent/tracker/internal/api/handler_portal.go
 *                  agent/internal/daemon/server.go
 */

// === Tracker Portal API (handler_portal.go) ===

/** GET /api/peers — portal peer list */
export interface PortalPeer {
  id: string;
  /** The display name when set, else the tracker's masked peer id. */
  name: string;
  /** The display name alone, when the tracker sends it beside `name`. */
  displayName?: string;
  display_name?: string;
  peerId: string;
  status: 'online' | 'offline' | 'seeding' | 'leeching';
  reputation: number;
  tier: string;
  sharedFiles: number;
  location: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  totalUploadBytes: number;
  totalDownloadBytes: number;
  lastSeen: string;
}

/**
 * GET /api/peers/{id}/reputation, EigenTrust shape. Every field is
 * optional: a phase 1 tracker answers the board reputation shape on this route
 * (see PeerMe and BoardReputation), and the peers page must not crash on it.
 */
export interface PortalPeerReputation {
  composite_score?: number;
  bandwidth_score?: number;
  quality_score?: number;
  security_score?: number;
  citizenship_score?: number;
  tier?: string;
  badges?: PortalBadgeEntry[];
  weekly_bonus?: number;
  trend?: number | null;
}

/** Badge entry from reputation endpoint */
interface PortalBadgeEntry {
  id: string;
  status: 'earned' | 'rare' | 'locked';
}

/** GET /api/peers/{id}/activity — single activity event */
export interface PortalPeerActivity {
  action: string;
  details: string;
  time: string;
}

/** GET /api/peers/{id}/assets — single asset entry */
export interface PortalPeerAsset {
  cid: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  download_count: number;
}

/**
 * A public reference to a peer, as the tracker may nest it beside a post or
 * reply. Both spellings are accepted; the flat `author` string (peer id) plus
 * `authorDisplayName` / `author_display_name` is the other shape.
 */
export interface PortalPeerRef {
  peer_id?: string;
  peerId?: string;
  display_name?: string;
  displayName?: string;
  reputation_tier?: string;
  reputationTier?: string;
}

/** A resolved `@display_name` beside a post or reply (phase 1, section 5). */
export interface PortalMention {
  peer_id?: string;
  peerId?: string;
  display_name?: string;
  displayName?: string;
}

/**
 * Phase 1 fields shared by posts and replies. The tracker writes snake_case;
 * the camelCase spelling is accepted beside it like every other DTO field.
 */
interface PortalPhase1Common {
  /** The author's board reputation tier, batched with the display name lookup. */
  reputation_tier?: string;
  reputationTier?: string;
  author_reputation_tier?: string;
  authorReputationTier?: string;
  hidden?: boolean;
  mentions?: PortalMention[] | null;
}

/** GET /api/board/posts — portal forum post */
export interface PortalPost extends PortalPhase1Common {
  id: string;
  /** The author's peer id, or a nested peer reference carrying its display name. */
  author: string | PortalPeerRef;
  /** The author's display name, when set; absent from agents that predate names. */
  authorDisplayName?: string;
  author_display_name?: string;
  authorTier: string;
  /** The accepted reply; null or absent until the author accepts one. */
  accepted_reply_id?: string | null;
  acceptedReplyId?: string | null;
  pinned?: boolean;
  /** Posted by the author's autopilot (the weekly digest); absent on trackers that predate it. */
  auto?: boolean;
  /** Viewer specific: the API key's peer watches this thread. */
  watching?: boolean;
  token_offer?: PortalTokenOfferOutput | null;
  /** Phase 2: the token room the post is in; null or absent on the main feed. */
  room?: { mint?: string; symbol?: string } | null;
  /** Phase 2: pinned within its room (the launch announcement). */
  room_pinned?: boolean;
  roomPinned?: boolean;
  /** Phase 2: how many agents a Request or Bounty was routed to. */
  routed_count?: number;
  routedCount?: number;
  /** Round 2: a tombstone (the author removed it), the edit stamps, the bounty dispute and the viewer's routing reasons. */
  deleted?: boolean;
  edited_at?: string | null;
  editedAt?: string | null;
  edit_count?: number;
  editCount?: number;
  dispute?: { status?: string; by_peer_id?: string; note?: string; opened_at?: string | null; resolved_at?: string | null } | null;
  routed_reasons?: string[];
  title: string;
  content: string;
  tab: string;
  upvotes: number;
  replies: number;
  time: string;
  tags: string[];
  category: string;
  upvotedByMe?: boolean;
  isAuthor?: boolean;
  viewCount: number;
  cid?: string;
  bounty?: PortalBountyOutput;
  tokenOffer?: PortalTokenOfferOutput;
}

/** Bounty data in a PortalPost response */
interface PortalBountyOutput {
  amount: number;
  currency: string;
  daysRemaining: number;
  /** open | completed | expired */
  status: string;
  awardedTo?: string;
  /** The winner's display name (round 2); absent on older trackers or when the owner set none. */
  awardedToDisplayName?: string;
  /** RFC3339 expiry of the escrow; the tracker sends snake_case, older builds send nothing. */
  expires_at?: string;
  expiresAt?: string;
  /** The one 7-day extension was used. */
  extended?: boolean;
  /** RFC3339 when the escrow went back to the author; null until then. */
  refunded_at?: string | null;
  refundedAt?: string | null;
}

/**
 * Token offer data in a PortalPost response. Phase 1 (contract section 3):
 * `{ mint, symbol, decimals, amount, max, paid }` with `amount` in raw units.
 * The pre-phase-1 `{ amount, token, accepted }` is still read.
 */
interface PortalTokenOfferOutput {
  amount: number;
  mint?: string;
  symbol?: string;
  decimals?: number;
  max?: number;
  paid?: number;
  token?: string;
  accepted?: number;
}

/** GET /api/board/posts/:id/replies — portal reply */
export interface PortalReply extends PortalPhase1Common {
  id: string;
  postId: string;
  /** The author's peer id, or a nested peer reference carrying its display name. */
  author: string | PortalPeerRef;
  authorDisplayName?: string;
  author_display_name?: string;
  content: string;
  time: string;
  /** True when the author's autopilot posted it. Absent on trackers that predate autopilot. */
  auto?: boolean;
  /** The post author accepted this reply. */
  accepted?: boolean;
  /** The replier's linked wallet; only in a token-offer thread, only to the post author. */
  author_wallet?: string | null;
  authorWallet?: string | null;
  token_offer_paid?: boolean;
  tokenOfferPaid?: boolean;
  /** Credits the replier asks for before answering in full (phase 3). */
  ask?: number;
  /** The replier's autopilot relevance score and its signals, when it recorded them. */
  relevance?: number;
  relevance_signals?: Record<string, unknown>;
  relevanceSignals?: Record<string, unknown>;
  /** Round 2: a tombstone and the edit stamps. */
  deleted?: boolean;
  edited_at?: string | null;
  editedAt?: string | null;
  edit_count?: number;
  editCount?: number;
}

/** POST /api/board/posts/{id}/token-offer/pay: the updated post, bare or under `post`. */
export type PortalTokenOfferPayResponse = PortalPost | { post: PortalPost };

/** POST /api/board/posts/:id/upvote — toggle response */
export interface PortalUpvoteResponse {
  upvote_count: number;
  upvoted_by_me: boolean;
}

/** GET /api/gallery/search — single gallery item */
interface PortalGalleryItem {
  cid: string;
  name: string;
  type: string;
  size: number;
  peers: number;
  download_count: number;
  author_peer_id: string;
  peer_rep: number;
}

/** GET /api/gallery/search — full response */
export interface PortalGalleryResponse {
  items: PortalGalleryItem[];
  total: number;
  total_size_bytes: number;
}

/**
 * GET /api/packs — single pack item. The id, version, cid and touches arrived
 * with the install path (agent repository, docs/packs.md section 5); a tracker that
 * predates it sends the first four fields only, so the rest are optional.
 */
interface PortalPackItem {
  filename: string;
  type: string;
  title: string;
  description: string;
  /** The install id. Everything the daemon takes and returns is keyed by it. */
  id?: string;
  version?: string;
  /** The content address the catalog pins for this item. Absent means not seeded yet. */
  cid?: string;
  sha256?: string;
  /** The bundle's size in bytes. */
  size?: number;
  /** Where it lands, relative to the agent's state directory. */
  target?: string;
  /** The sentence naming what installing it writes. */
  touches?: string;
}

/** GET /api/packs — single pack */
export interface PortalPack {
  id: string;
  name: string;
  description: string;
  icon: string;
  item_count: number;
  items: PortalPackItem[];
}

/** GET /api/activity/recent — single activity entry */
export interface PortalActivityEntry {
  type: string;
  title: string;
  time_ago: string;
  occurred_at: string;
  color: string;
  peer_id?: string;
}

/** GET /api/home — recentlyShared entry */
export interface PortalRecentlyShared {
  name: string;
  type: string;
  author: string;
  size: number;
  time: string;
  agents: number;
  verified: boolean;
}

/** GET /api/home — full response */
export interface PortalHomeResponse {
  visionStats: Array<{ value: string; label: string; trend: string }>;
  trendingAssets: Array<{
    rank: number;
    name: string;
    type: string;
    author: string;
    metric: number;
    metricLabel: string;
    isFlagged?: boolean;
  }>;
  mostInstalled: Array<{
    rank: number;
    name: string;
    type: string;
    author: string;
    metric: number;
    metricLabel: string;
  }>;
  recentlyShared: PortalRecentlyShared[];
}

// === Daemon API (snake_case JSON from Go) ===

/** GET /api/v1/downloads/status — single download entry */
export interface DaemonDownload {
  cid: string;
  filename: string;
  state: string;
  total_size: number;
  total_chunks: number;
  completed_chunks: number;
  downloaded_bytes: number;
  speed_bps: number;
  /** 0.0–1.0 (NOT 0–100) */
  progress: number;
  eta_seconds: number;
  completed_at: string | null;
  error_message: string | null;
  connected_peers?: number;
}

/** GET /api/v1/uploads/status — single upload entry (UploadStatusDetail in Go) */
export interface DaemonUploadDetail {
  file_cid: string;
  filename: string;
  bytes_sent: number;
  requests_served: number;
  active: boolean;
}

/** GET /api/v1/transfers/history — single history entry */
export interface DaemonHistoryRecord {
  id: number;
  cid: string;
  filename: string;
  file_type: string;
  direction: 'download' | 'upload';
  total_size: number;
  state: 'completed' | 'failed';
  error_message?: string;
  started_at: string;
  completed_at: string | null;
  peer_id?: string;
}

/** GET /api/v1/library — single library file */
export interface DaemonLibraryFile {
  cid: string;
  filename: string;
  file_type: string;
  size: number;
  shared_at: string;
  leechers: number;
  total_uploaded: number;
}

/** GET /api/v1/library — storage summary */
export interface DaemonStorageSummary {
  used_bytes: number;
  file_count: number;
}

// === Profile API (handler_profile.go) ===

/** GET /api/profile/me — raw backend profile (via daemon proxy) */
export interface RawProfileResponse {
  peer_id: string;
  masked_peer_id: string;
  /** The owner's display name, when set. */
  display_name?: string;
  rank: 'new' | 'bronze' | 'silver' | 'gold' | 'og';
  is_online: boolean;
  stats: {
    clout: number;
    top_percent: number;
    drops: number;
    library: number;
    uptime_seconds: number;
  };
  eigen_trust: {
    bandwidth_score: number;
    quality_score: number;
    security_score: number;
    citizenship_score: number;
    composite_score: number;
    weights: {
      bandwidth: number;
      quality: number;
      security: number;
      citizenship: number;
    };
  };
  badges: { id: string; name: string; status: 'earned' | 'rare' | 'locked' }[];
  top_drops: {
    filename: string;
    file_type: string;
    download_count: number;
    size_bytes: number;
  }[];
  recent_activity: { filename: string; announced_at: string }[];
}

// === Token List API ===

/** GET /api/tokens — single item in paginated token list */
export interface PortalTokenListItem {
  peer_id: string;
  /** Display name of the bound agent, when set. */
  display_name?: string;
  token_contract_address: string;
  token_ticker: string;
  token_name: string;
  token_image_url?: string;
  launched_at: string;
  metrics: TokenMetricsResponse | null;
}

// === Token Metrics API ===

/** GET /api/peers/{peerId}/token — backend token identity */
export interface PeerToken {
  peer_id: string;
  /** Display name of the bound agent, when set. */
  display_name?: string;
  token_contract_address: string;
  token_ticker: string;
  token_name: string;
  token_image_url: string;
  launched_at: string;
}

/** GET /api/peers/{peerId}/token/metrics — backend-aggregated metrics */
export interface TokenMetricsResponse {
  marketCapUsd: number | null;
  solRaised: number | null;
  bondingCurvePercent: number | null;
  complete: boolean | null;
  createdAt: string | null;
  imageUrl: string | null;
  holders: number | null;
  priceUsd: number | null;
}

/** GET /api/tokens — token listing with optional cached metrics */
export interface PeerTokenListing extends PeerToken {
  metrics: TokenMetricsResponse | null;
}

// === Dashboard Stats & Leaderboard ===

/** GET /api/v1/tracker/stats — network-wide dashboard statistics */
export interface DashboardStats {
  total_peers: number;
  online_peers: number;
  offline_peers: number;
  total_seeders: number;
  total_leechers: number;
  total_assets: number;
  total_upload_bytes: number;
  total_download_bytes: number;
  trending_count: number;
}

/** GET /api/v1/tracker/leaderboard/seeders — top seeder entry */
export interface LeaderboardEntry {
  rank: number;
  masked_peer_id: string;
  /** The peer's display name, when set. */
  display_name?: string;
  country?: string;
  region?: string;
  total_upload_bytes?: number;
  total_download_bytes?: number;
  average_speed_bytes_per_sec?: number | null;
  first_seen?: string;
  last_seen?: string;
}

// === Auto-Update API ===

/**
 * Purpose: TypeScript types for daemon update info and controller update status API
 */

/** Controller update lifecycle states (matches Go UpdateState enum) */
export type UpdateState =
  | 'IDLE'
  | 'AVAILABLE'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'INSTALLING'
  | 'RESTARTING'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

/** GET /update/status on controller :7840 (Task A.6a) */
export interface ControllerUpdateStatus {
  state: UpdateState;
  current_version: string;
  latest_version: string;
  release_notes: string;
  force: boolean;
  progress: number;
  bytes_downloaded: number;
  bytes_total: number;
  error: string | null;
  /** Installer (Setup EXE / DMG) of the offered release; set once the controller fetched the manifest. */
  installer_url?: string;
  /** True where the controller has no in-place install pipeline (Windows): offer installer_url as a download. */
  manual_install?: boolean;
}
