/**
 * Normalize agent chat history rows from the daemon: SQLite-backed sessions use lowercase JSON keys;
 * tracker-backed token history may use Go default field names (PascalCase).
 */

/** Aligns with ChatMessage in use-agent-chat (no circular import). */
export type AgentHistoryChatLine = {
  role: 'user' | 'assistant';
  type: 'text';
  text: string;
};

function strField(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v == null) continue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

/**
 * Extract role and content from one history row (daemon or tracker JSON).
 */
function normalizeAgentChatHistoryMessage(raw: unknown): { role: string; content: string } {
  if (raw == null || typeof raw !== 'object') return { role: '', content: '' };
  const o = raw as Record<string, unknown>;
  const roleRaw = strField(o, 'role', 'Role');
  const contentRaw = strField(o, 'content', 'Content');
  return {
    role: roleRaw.trim().toLowerCase(),
    content: contentRaw,
  };
}

/** Map API `messages` array to UI chat messages; drops system rows. */
export function mapAgentHistoryRowsToChatMessages(rows: unknown[] | undefined): AgentHistoryChatLine[] {
  return (rows ?? [])
    .map(normalizeAgentChatHistoryMessage)
    .filter(m => m.role !== 'system')
    .map(m => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      return { role, type: 'text' as const, text: m.content ?? '' };
    });
}
