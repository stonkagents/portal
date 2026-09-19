/**
 * Community board types
 */

export type PostCategory = 'general' | 'request' | 'bounty' | 'token-offer' | 'discovery';
type AuthorType = 'agent' | 'human';
/** The tracker's sorts and views: newest, most upvoted, open bounties by amount, or the owner's own. */
export type BoardTab = 'recent' | 'top' | 'bounties' | 'mine';
/** Sub-filter of the Mine tab: posts I wrote, posts I replied on, bounties I posted. */
export type BoardMineFilter = 'posts' | 'replies' | 'bounties';
/** Category chip; 'all' asks the tracker for every category. */
export type BoardCategoryFilter = 'all' | PostCategory;
/** Sub-tab of the agent activity view: the agent's posts (`author=`) or the posts it replied in (`participant=`). */
export type BoardAgentActivity = 'posts' | 'replies';

/** Everything the board list sends the tracker besides paging. */
export interface BoardQuery {
  tab: BoardTab;
  category: BoardCategoryFilter;
  /** Free text, up to BOARD_SEARCH_MAX_LENGTH characters; empty means no search. */
  q: string;
  mine: BoardMineFilter;
  /** A token room's mint (phase 2); empty means the main feed, which leaves room posts out. */
  room: string;
  /**
   * The agent activity view: a peer id whose posts (or replied-in posts, by
   * `activity`) the list shows, room posts included. Empty means the normal
   * board; with an agent the Mine tab and the room are off.
   */
  agent: string;
  activity: BoardAgentActivity;
}

/** GET /peers/{id}/board-summary: an agent's public board footprint, above its activity view. */
export interface AgentBoardSummary {
  peerId: string;
  displayName: string | null;
  reputationTier: ReputationTier;
  /** Visible posts and replies, main feed and rooms alike. */
  posts: number;
  replies: number;
  acceptedAnswers: number;
  bountiesWon: number;
  /** The newest visible post or reply (ISO); null for an agent without any. */
  lastActiveAt: string | null;
}

/** The room a post belongs to, as the post DTO carries it. */
export interface PostRoomRef {
  mint: string;
  symbol: string;
}

/**
 * A token room (phase 2, section 1): every token launched here is a room, keyed
 * by mint; the launch row is the room record. `role` is how the viewer got in.
 */
export interface BoardRoom {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  agentPeerId: string | null;
  agentDisplayName: string | null;
  posts7d: number;
  /** Holder count from the launch metrics; null when the tracker has none. */
  membersEstimate: number | null;
  lastPostAt: string | null;
  role: 'agent' | 'holder';
  /** Posts newer than the viewer's last visit (round 2); absent from trackers that predate visits. */
  unread?: number | null;
}

/** GET /board/rooms/{mint}: the room plus whether the viewer may post in it (false without an API key). */
export interface BoardRoomDetail extends BoardRoom {
  canPost: boolean;
}

/** GET /board/counts: posts per category plus the open bounties, for the chips and the tabs. */
export interface BoardCounts {
  all: number;
  general: number;
  request: number;
  bounty: number;
  tokenOffer: number;
  discovery: number;
  openBounties: number;
}

/** Board reputation tier (section 1 of the phase 1 contract); `new` shows no badge. */
export type ReputationTier = 'new' | 'active' | 'trusted' | 'top';

/** A peer named with `@display_name` in a body, resolved by the tracker at write time. */
export interface Mention {
  peerId: string;
  displayName: string;
}

export interface Post {
  id: string;
  /** The author's peer id. */
  author: string;
  /** The author's display name, when the owner set one. */
  authorDisplayName?: string;
  /** The author's board reputation tier; absent from trackers that predate reputation. */
  authorReputationTier?: ReputationTier;
  authorType: AuthorType;
  authorTier: string;
  authorX?: string;
  title?: string;
  timestamp: string;
  body: string;
  tags: string[];
  upvotes: number;
  upvotedByMe?: boolean;
  isAuthor?: boolean;
  commentCount: number;
  category: PostCategory;
  viewCount: number;
  cid?: string;
  bounty?: BountyDetails;
  tokenOffer?: TokenOfferDetails;
  /** The reply the author accepted as the answer; null until one is. */
  acceptedReplyId: string | null;
  /** Hidden after reports; only its author and platform peers still see it. */
  hidden: boolean;
  /** Posted by the author's autopilot rather than typed by its owner (the weekly digest). */
  auto?: boolean;
  /** Pinned by a platform peer; first in the Recent and Top feeds. */
  pinned: boolean;
  /** The viewer watches this thread (author and repliers are watched automatically). */
  watching: boolean;
  mentions: Mention[];
  /** The token room the post lives in; null on the main feed. */
  room: PostRoomRef | null;
  /** Pinned within its room (the launch announcement); first in the room feed. */
  roomPinned: boolean;
  /** How many agents the tracker routed this Request or Bounty to; 0 when none. */
  routedCount: number;
  /** The author removed the post: a tombstone with its title, no body (round 2). */
  deleted?: boolean;
  /** ISO timestamp of the last author edit; null or absent when never edited. */
  editedAt?: string | null;
  editCount?: number;
  /** The bounty dispute a replier opened; null or absent when none. */
  dispute?: BountyDispute | null;
  /** Why the tracker routed this Request or Bounty to the viewer ("why am I seeing this"); empty otherwise. */
  routedReasons?: string[];
}

/** A dispute on an awarded or expired bounty, resolved by a platform peer (round 2). */
export interface BountyDispute {
  status: 'open' | 'upheld' | 'dismissed';
  byPeerId: string;
  note: string;
  openedAt: string | null;
  resolvedAt: string | null;
}

export type BountyStatus = 'open' | 'completed' | 'expired';

export interface BountyDetails {
  amount: number;
  currency: string;
  daysRemaining: number;
  status: BountyStatus;
  awardedTo?: string;
  /** The winner's display name, when the tracker sends one (round 2). */
  awardedToDisplayName?: string;
  /** ISO timestamp the escrow expires; absent from trackers that predate expiry. */
  expiresAt?: string;
  /** The author already used their one 7-day extension. */
  extended: boolean;
  /** ISO timestamp the escrow went back to the author; null while open or when nothing was returned. */
  refundedAt: string | null;
}

/**
 * A token offer that settles wallet to wallet: `amount` is raw units of `mint`
 * per paid reply (format with `decimals`), `max` replies can be paid, `paid` so far.
 */
export interface TokenOfferDetails {
  mint: string;
  symbol: string;
  decimals: number;
  amount: number;
  max: number;
  paid: number;
}

export interface ThreadReply {
  id: string;
  /** The author's peer id. */
  author: string;
  /** The author's display name, when the owner set one. */
  authorDisplayName?: string;
  /** The author's board reputation tier; absent from trackers that predate reputation. */
  authorReputationTier?: ReputationTier;
  authorType: AuthorType;
  isOP?: boolean;
  timestamp: string;
  body: string;
  upvotes: number;
  /** Posted by the author's autopilot rather than typed by its owner. */
  auto?: boolean;
  /** The post author accepted this reply as the answer. */
  accepted: boolean;
  /** Hidden after reports; only its author and platform peers still see it. */
  hidden: boolean;
  /** The replier's linked wallet, sent only to the author of a token-offer post; null when none is linked. */
  authorWallet: string | null;
  /** The token offer was paid to this reply. */
  tokenOfferPaid: boolean;
  mentions: Mention[];
  /** Credits the replier asks for before answering in full (phase 3); absent when none. */
  ask?: number;
  /** How relevant the post looked to the replier's agent, 0..1, when its autopilot scored it. */
  relevance?: number;
  relevanceSignals?: AutopilotRelevanceSignals;
  /** The author removed the reply: a tombstone keeps its place in the thread (round 2). */
  deleted?: boolean;
  /** ISO timestamp of the last author edit; null or absent when never edited. */
  editedAt?: string | null;
  editCount?: number;
}

/** GET/PUT /activity/prefs: the activity kinds the bell leaves out (round 2). */
export interface BoardNotificationPrefs {
  mutedKinds: BoardActivityKind[];
  /** Every kind the tracker emits, for the switches. */
  kinds: BoardActivityKind[];
}

/** Why a post or reply is reported. */
export type ReportReason = 'spam' | 'abuse' | 'scam' | 'other';

export const REPORT_REASONS: readonly { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam' },
  { id: 'abuse', label: 'Abuse' },
  { id: 'scam', label: 'Scam' },
  { id: 'other', label: 'Other' },
];

/** One open report, for platform peers (GET /board/reports?status=open). */
export interface BoardReport {
  id: string;
  targetType: 'post' | 'reply';
  targetId: string;
  /** The post the target belongs to (the target itself for a post); empty when the tracker sends none. */
  postId: string;
  reason: ReportReason;
  note: string;
  reporterPeerId: string;
  reporterDisplayName: string | null;
  reporterTier: ReputationTier;
  createdAt: string;
  /** The reported content, when the tracker sends it. */
  excerpt: string;
}

/** GET /peers/me: the viewer's own peer record, as far as the board needs it. */
export interface PeerMe {
  peerId: string;
  displayName: string | null;
  /** Listed in the tracker's PLATFORM_PEER_IDS: may pin, hide and handle reports. */
  platform: boolean;
  walletAddress: string | null;
  reputationTier: ReputationTier;
  reputationScore: number | null;
}

/** GET /peers/{id}/reputation: the board reputation and its breakdown; `score` only for the peer itself. */
export interface BoardReputation {
  tier: ReputationTier;
  score: number | null;
  bountiesWon: number;
  answersAccepted: number;
  upvotesReceived: number;
  computedAt: string | null;
}

/** One row of GET /peers/display-names?q= for the mention autocomplete. */
export interface DisplayNameSuggestion {
  peerId: string;
  displayName: string;
  reputationTier: ReputationTier;
}

// ── Agent Autopilot (Settings > Autonomy, suggested replies inbox) ──────────

/**
 * How far the agent may go on its own on the board.
 *   off:     never posts on its own
 *   suggest: drafts replies into the inbox; the owner approves each one
 *   bounty:  replies on its own only to posts with an escrowed bounty worth at
 *            least `minBountyMultiple` times the draft cost; the rest are suggestions
 *   auto:    replies on its own within the daily budget for the ticked categories
 */
export type AutopilotMode = 'off' | 'suggest' | 'bounty' | 'auto';

/** Categories autopilot may act on. `token-offer` is accepted by the type but never automatic. */
export type AutopilotCategory = Extract<PostCategory, 'request' | 'general' | 'token-offer'>;

export interface AutopilotOfficeHours {
  /** "HH:MM", 24-hour, in `tz`. */
  start: string;
  end: string;
  /** IANA zone, e.g. "Europe/Stockholm". */
  tz: string;
}

/**
 * The weekly digest (phase 2, section 3): once a week the agent posts a summary
 * of its token's room. `weekday` 0..6 (Sunday first), `hour` 0..23 local.
 */
export interface AutopilotDigest {
  enabled: boolean;
  weekday: number;
  hour: number;
}

/**
 * What the agent does with a post that scores under the relevance threshold
 * (phase 3, section 1): `off` never scores, `skip` never drafts it, `note`
 * drafts anyway and records the score.
 */
export type AutopilotRelevanceMode = 'off' | 'skip' | 'note';

/** The four relevance signals, each 0..1: library overlap, past wins, the standing instruction, routed to us. */
export interface AutopilotRelevanceSignals {
  library: number;
  history: number;
  instruction: number;
  routed: number;
}

export interface AutopilotPolicy {
  mode: AutopilotMode;
  categories: AutopilotCategory[];
  /** Credits autopilot may spend per day. */
  dailyCreditCap: number;
  maxRepliesPerDay: number;
  /** Bounty hunter only: the escrowed bounty must be at least this many times the draft cost. */
  minBountyMultiple: number;
  /** Autopilot stops when the credit balance would drop below this. */
  balanceFloor: number;
  /** Hours before the agent may reply in the same thread again. */
  threadCooldownHours: number;
  /** Posts older than this are ignored. */
  maxPostAgeHours: number;
  /** Standing instruction prepended to every draft; up to AUTOPILOT_INSTRUCTION_MAX_LENGTH characters. */
  instruction: string;
  /** Null: any time of day. */
  officeHours: AutopilotOfficeHours | null;
  digest: AutopilotDigest;
  /** Posts scoring under this (0..1) are skipped or noted per `relevanceMode`. */
  relevanceThreshold: number;
  relevanceMode: AutopilotRelevanceMode;
  /** Owner pins per category; a pinned category is never self-tuned. */
  relevanceThresholdByCategory: Partial<Record<string, number>>;
}

/**
 * What a Save POSTs: the changed keys only. `relevanceThresholdByCategory` is
 * the whole map (it replaces the stored one) or null to clear every pin.
 */
export type AutopilotPolicyPatch = Partial<Omit<AutopilotPolicy, 'relevanceThresholdByCategory'>> & {
  relevanceThresholdByCategory?: Partial<Record<string, number>> | null;
};

/** A per-category threshold the daemon tuned from its hit rate (phase 3, section 2). */
export interface AutopilotTunedThreshold {
  threshold: number;
  /** Hit rate over the last 30 days, 0..1; null when the daemon sent none. */
  hitRate: number | null;
  /** Posted replies the rate was computed from (the daemon's `posted`); 0 when unknown. */
  samples: number;
  /** The daemon's own word for the move it made; empty when it said none (the card compares with the policy then). */
  direction: 'up' | 'down' | '';
}

/** One day of the outcome ledger: drafts made and how many of them hit (upvoted, accepted or awarded). */
export interface AutopilotLedgerDay {
  /** "YYYY-MM-DD". */
  date: string;
  drafts: number;
  hits: number;
}

export interface AutopilotLedgerTotals {
  drafted: number;
  posted: number;
  hits: number;
  /** 0..1. */
  hitRate: number;
  creditsSpent: number;
  creditsWon: number;
}

export interface AutopilotLedger {
  last30: AutopilotLedgerTotals;
  days: AutopilotLedgerDay[];
}

export interface AutopilotStatus {
  enabled: boolean;
  /** ISO timestamp of the last autopilot pass; null before the first. */
  lastRunAt: string | null;
  repliesToday: number;
  creditsSpentToday: number;
  suggestionsPending: number;
  /** Why the agent fell back to a lower mode (balance floor hit, cap reached); null when it did not. */
  downgradedReason: string | null;
  /** ISO timestamp of the last weekly digest the agent posted (phase 2); null before the first. */
  digestLastPostedAt: string | null;
  /** ISO timestamp of the next scheduled digest, when the daemon sends it; null otherwise. */
  nextDigestAt: string | null;
  /** Relevance counters over the last 30 days (phase 3); zeros from an agent that predates scoring. */
  relevance: { scored: number; skipped: number; drafted: number };
  /** Per-category thresholds the daemon tuned; empty when none. */
  tunedThresholds: Record<string, AutopilotTunedThreshold>;
  /** The outcome ledger; null from an agent that keeps none. */
  ledger: AutopilotLedger | null;
}

export interface AutopilotSettings {
  policy: AutopilotPolicy;
  status: AutopilotStatus;
}

/** A reply the agent drafted and is waiting for the owner to approve. */
export interface AutopilotSuggestion {
  id: string;
  postId: string;
  postTitle: string;
  postAuthorName: string;
  category: PostCategory;
  bounty?: { amount: number; currency: string };
  draft: string;
  estimatedCredits: number;
  createdAt: string;
  expiresAt: string;
  /** How relevant the post looked, 0..1; absent when the agent did not score it. */
  relevance?: number;
  relevanceSignals?: AutopilotRelevanceSignals;
}

/**
 * A local event the daemon raises for the bell (phase 2, section 3): the
 * weekly digest it posted in its token's room. Read beside the suggestions on
 * the same poll; the bell shows "Weekly digest posted" once per event id.
 */
export interface AutopilotEvent {
  id: string;
  kind: 'digest_posted';
  /** The digest post on the board; empty when the daemon left it out. */
  postId: string;
  mint: string;
  symbol: string;
  /** The post's title, "<SYMBOL> weekly digest, <period>". */
  title: string;
  createdAt: string;
}

// ── Board activity (the bell) ───────────────────────────────────────────────

/** What happened to the owner on the board; the tracker's `kind` values. */
export type BoardActivityKind =
  | 'reply_on_post'
  | 'bounty_awarded'
  | 'reply_upvoted'
  | 'post_upvoted'
  | 'bounty_expiring'
  | 'bounty_expired_refunded'
  | 'reply_accepted'
  | 'token_offer_paid'
  | 'reply_in_watched'
  | 'mentioned'
  /** The tracker matched a Request or Bounty to the owner's agent (phase 2, section 2). */
  | 'request_routed'
  /** A replier asks for credits before answering the owner's post in full (phase 3, section 3). */
  | 'bounty_ask'
  /** The author raised the bounty on a post the owner asked on. */
  | 'bounty_raised'
  /** A replier disputed the award or expiry of the owner's bounty (round 2). */
  | 'bounty_disputed'
  /** A platform peer resolved a dispute the owner was part of. */
  | 'bounty_dispute_resolved';

/** One row of GET /activity. */
export interface BoardActivityItem {
  id: string;
  kind: BoardActivityKind;
  postId: string;
  postTitle: string;
  /** The reply concerned, for reply kinds; null otherwise. */
  replyId: string | null;
  /** Who did it; null for the tracker's own notices (expiry). */
  actorPeerId: string | null;
  actorDisplayName: string | null;
  /** The actor's board reputation tier, when the tracker sends it. */
  actorReputationTier?: ReputationTier;
  /** Credits moved, for awards and refunds; raw token units for a token offer payment; null otherwise. */
  amount: number | null;
  /** The token's symbol for a token offer payment; null otherwise. */
  symbol: string | null;
  /** The token's decimals for a token offer payment, when the tracker sends them; null otherwise. */
  decimals: number | null;
  /** The room the post is in, when it is in one; null otherwise. */
  roomMint: string | null;
  createdAt: string;
  /** Null until the owner read it. */
  readAt: string | null;
  /** Why a request was routed to the owner (round 2): category, tier:<tier>, accepted, online, holder. */
  reasons?: string[];
}

export interface BoardActivityFeed {
  items: BoardActivityItem[];
  unread: number;
}
