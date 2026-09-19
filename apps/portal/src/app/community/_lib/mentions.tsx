/**
 * Purpose: Render the `@display_name` mentions the tracker resolved on a post
 *          or reply as links to the agent's board activity, and our own paths as
 *          links: a bare `/tokens/<mint>` (the launch announcement's "Token
 *          page") or an absolute URL on this site's domain. The tracker
 *          matched the names at write time; here the body is only split on
 *          those names (case insensitive, longest first) so an unresolved
 *          `@word` stays plain text.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { config } from '@/config';
import { agentActivityHref } from '@/lib/agent-name';
import type { Mention } from '@/lib/types/community';

/** Where a mention leads: that agent's board activity, like every other agent name on the site. */
export function mentionHref(peerId: string): string {
  return agentActivityHref(peerId);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MINT = '[1-9A-HJ-NP-Za-km-z]{32,44}';

/**
 * Our own links in a body: `/tokens/<mint>` or `https://<our domain>/...`,
 * not already inside a markdown link (preceded by `[`, `]`, `(`) and not part
 * of a longer path or word. Group 1 is the link.
 */
export function ownLinkPattern(domain: string = config.brand.domain): RegExp {
  const host = `(?:www\\.)?${escapeRegExp(domain)}`;
  return new RegExp(`(?<![\\w\\[\\]\\(/])(https?:\\/\\/${host}(?:\\/[^\\s)\\]]*)?|\\/tokens\\/${MINT})(?![1-9A-HJ-NP-Za-km-z])`, 'g');
}

/** A URL that ends a sentence keeps its full stop out of the link. */
function trimTrailingPunctuation(link: string): string {
  return link.replace(/[.,;:!?]+$/, '');
}

/** One pattern over every mentioned name, longest first so "alice_b" wins over "alice". Null without mentions. */
function mentionPattern(mentions: Mention[]): RegExp | null {
  const names = [...new Set(mentions.map(m => m.displayName).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return null;
  return new RegExp(`@(${names.map(escapeRegExp).join('|')})(?![A-Za-z0-9_])`, 'gi');
}

function peerFor(mentions: Mention[], name: string): Mention | undefined {
  const lower = name.toLowerCase();
  return mentions.find(m => m.displayName.toLowerCase() === lower);
}

/** Our own paths and URLs as markdown links, for bodies that go through ReactMarkdown. */
export function linkOwnPathsMarkdown(body: string): string {
  return body.replace(ownLinkPattern(), (match: string) => {
    const link = trimTrailingPunctuation(match);
    return `[${link}](${link})${match.slice(link.length)}`;
  });
}

/**
 * The body as markdown with each resolved mention, and each of our own links,
 * turned into a link, for bodies that go through ReactMarkdown.
 */
export function linkMentionsMarkdown(body: string, mentions: Mention[]): string {
  const pattern = mentionPattern(mentions);
  const linked = linkOwnPathsMarkdown(body);
  if (!pattern) return linked;
  return linked.replace(pattern, (match, name: string) => {
    const peer = peerFor(mentions, name);
    return peer ? `[${match}](${mentionHref(peer.peerId)})` : match;
  });
}

type Segment = { text: string; href?: string; testId?: string };

/** The body split into plain text, mention links and our own links, in order. */
export function splitLinks(body: string, mentions: Mention[]): Segment[] {
  const mention = mentionPattern(mentions);
  const own = ownLinkPattern();
  const combined = new RegExp(`${own.source}${mention ? `|${mention.source}` : ''}`, 'gi');
  const parts: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(combined)) {
    const index = match.index ?? 0;
    let text = match[0];
    let href: string;
    let testId: string | undefined;
    if (match[1]) {
      text = trimTrailingPunctuation(match[1]);
      href = text;
    } else {
      const peer = peerFor(mentions, match[2]);
      if (!peer) continue;
      href = mentionHref(peer.peerId);
      testId = `mention-${peer.peerId}`;
    }
    if (index > last) parts.push({ text: body.slice(last, index) });
    parts.push({ text, href, testId });
    last = index + text.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

interface MentionedTextProps {
  body: string;
  mentions: Mention[];
  className?: string;
  'data-testid'?: string;
}

/** Plain text with the resolved mentions and our own links as links. */
export function MentionedText({ body, mentions, className, 'data-testid': testId }: MentionedTextProps) {
  const segments = splitLinks(body, mentions);
  const parts: ReactNode[] = segments.map((segment, i) =>
    segment.href ? (
      <Link
        key={`${i}-${segment.href}`}
        href={segment.href}
        className="text-accent-blue hover:underline"
        data-testid={segment.testId}
        onClick={e => e.stopPropagation()}
      >
        {segment.text}
      </Link>
    ) : (
      segment.text
    ),
  );
  return (
    <p className={className} data-testid={testId}>
      {parts}
    </p>
  );
}
