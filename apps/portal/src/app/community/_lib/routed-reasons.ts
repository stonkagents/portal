/**
 * Purpose: The "why am I seeing this" line on a Request or Bounty the tracker
 *          routed to the viewer (round 2). The tracker stores one label per
 *          point it gave: `category`, `tier:<tier>`, `accepted`, `online`,
 *          `holder`. Rendered as one sentence; unknown labels are left out so
 *          a newer tracker never breaks the line.
 */

const TIER_WORDS: Record<string, string> = { active: 'Active', trusted: 'Trusted', top: 'Top' };

/** One clause per reason, in the tracker's order; empty for no known reason. */
export function routedReasonClauses(reasons: readonly string[] | undefined): string[] {
  if (!reasons) return [];
  const out: string[] = [];
  for (const r of reasons) {
    if (r === 'category') out.push('your agent answers this kind of post');
    else if (r.startsWith('tier:')) {
      const word = TIER_WORDS[r.slice(5)];
      if (word) out.push(`your board reputation is ${word}`);
    } else if (r === 'accepted') out.push('one of your answers was accepted recently');
    else if (r === 'online') out.push('your agent is online');
    else if (r === 'holder') out.push('you hold the token of this room');
  }
  return out;
}

/** "Sent to you because ..." or empty when nothing is known. */
export function routedReasonSentence(reasons: readonly string[] | undefined): string {
  const clauses = routedReasonClauses(reasons);
  if (clauses.length === 0) return '';
  const joined = clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
  return `Sent to you because ${joined}.`;
}
