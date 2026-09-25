/**
 * Purpose: Centralized query key factory — prevents key collisions, enables targeted invalidation
 */

export const queryKeys = {
  peers: {
    all: ['peers'] as const,
    detail: (id: string) => ['peers', id] as const,
    token: (peerId: string) => ['peers', peerId, 'token'] as const,
    reputation: (id: string) => ['peers', id, 'reputation'] as const,
    assets: (id: string) => ['peers', id, 'assets'] as const,
    activity: (id: string) => ['peers', id, 'activity'] as const,
    trusted: ['peers', 'trusted'] as const,
    blocked: ['peers', 'blocked'] as const,
  },
  transfers: {
    all: ['transfers'] as const,
    stats: ['transfers', 'stats'] as const,
    history: ['transfers', 'history'] as const,
    library: ['transfers', 'library'] as const,
  },
  credits: {
    balance: ['credits', 'balance'] as const,
    transactions: ['credits', 'transactions'] as const,
    purchase: ['credits', 'purchase'] as const,
  },
  chat: {
    sessions: ['chat', 'sessions'] as const,
    messages: (id: string) => ['chat', 'sessions', id] as const,
  },
  tokens: {
    all: ['tokens'] as const,
    /** Canonical paginated list; share between useTokens and useTokenByContract. */
    list: (limit: number) => ['tokens', 'list', limit] as const,
    count: ['tokens', 'count'] as const,
    detail: (id: string) => ['tokens', id] as const,
    metrics: (peerId: string | null) => ['tokens', 'metrics', peerId] as const,
  },
  board: {
    posts: ['board', 'posts'] as const,
    byTab: (tab: string) => ['board', 'posts', tab] as const,
    post: (id: string) => ['board', 'posts', id] as const,
    /** Posts per category and open bounties, for the chips and the tabs; `room` scopes them to a token room. */
    counts: ['board', 'counts'] as const,
    countsFor: (room: string) => ['board', 'counts', room] as const,
    /** The token rooms the viewer may post in, and one room with its viewer-specific `canPost`. */
    rooms: ['board', 'rooms'] as const,
    room: (mint: string) => ['board', 'rooms', mint] as const,
    /** What happened to the owner on the board (the bell). */
    activity: ['board', 'activity'] as const,
    /** Which activity kinds the bell leaves out (round 2). */
    activityPrefs: ['board', 'activity', 'prefs'] as const,
    /** The viewer's own peer record (platform flag, linked wallet, tier). */
    me: ['board', 'me'] as const,
    /** Board reputation and breakdown of one peer. */
    reputation: (peerId: string) => ['board', 'reputation', peerId] as const,
    /** One peer's public board footprint (posts, replies, accepted answers, bounties won). */
    summary: (peerId: string) => ['board', 'summary', peerId] as const,
    /** Open reports, for platform peers. */
    reports: ['board', 'reports'] as const,
    /** Display names matching a prefix, for the mention autocomplete. */
    displayNames: (q: string) => ['board', 'display-names', q] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
  reputation: {
    me: ['reputation', 'me'] as const,
    leaderboard: ['reputation', 'leaderboard'] as const,
  },
  social: {
    integrations: ['social', 'integrations'] as const,
    connections: ['social', 'connections'] as const,
  },
  portfolio: {
    performance: ['portfolio', 'performance'] as const,
    all: ['portfolio'] as const,
  },
  profile: {
    me: ['profile', 'me'] as const,
  },
  daemon: {
    nodeStats: ['daemon', 'node-stats'] as const,
    /** The agent's own identity (peer id + display name) from the daemon. */
    identity: ['daemon', 'identity'] as const,
    /** Autopilot policy + status, and the drafts waiting for approval. */
    autopilot: ['daemon', 'autopilot'] as const,
    autopilotSuggestions: ['daemon', 'autopilot', 'suggestions'] as const,
    /** The daemon's local events for the bell (the weekly digests it posted). */
    autopilotEvents: ['daemon', 'autopilot', 'events'] as const,
    /** The background command tools job (Windows installer 2.6.0+), read from the controller. */
    commandTools: ['daemon', 'command-tools'] as const,
    /** The pack items this agent has installed, read from its own index. */
    packsInstalled: ['daemon', 'packs', 'installed'] as const,
  },
  gallery: {
    search: (q: string, type?: string) => ['gallery', 'search', q, type ?? ''] as const,
    stats: ['gallery', 'stats'] as const,
    packs: ['gallery', 'packs'] as const,
  },
  activity: {
    all: ['activity'] as const,
    recent: ['activity', 'recent'] as const,
  },
  home: {
    all: ['home'] as const,
  },
  update: {
    status: ['update', 'status'] as const,
  },
} as const;
