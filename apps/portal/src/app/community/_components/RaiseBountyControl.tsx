/**
 * Purpose: Under a reply that carries an ask, for the post author (phase 3,
 *          section 3): "Raise bounty to 60" meets the ask in one click, and a
 *          free amount beside it raises to any figure above the current bounty
 *          (or opens one when the post has none). Both call raise; the panel
 *          owns the hook.
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import type { Post } from '@/lib/types/community';

const BUTTON_CLS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow cursor-pointer hover:bg-accent-yellow/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const INPUT_CLS =
  'w-24 min-h-[32px] px-2 py-1 bg-bg-tertiary border border-border-default rounded text-xs text-text-primary font-mono outline-none focus:border-accent-yellow/50 disabled:cursor-not-allowed';

/** The bounty a raise must beat: the open bounty's amount, or 0 for a post without one. */
export function currentBounty(post: Pick<Post, 'bounty'>): number {
  return post.bounty && post.bounty.status === 'open' ? post.bounty.amount : 0;
}

/** A whole number of credits above the current bounty; null otherwise. */
export function parseRaiseAmount(value: string, current: number): number | null {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isInteger(n) && n > current ? n : null;
}

interface RaiseBountyControlProps {
  post: Post;
  replyId: string;
  ask: number;
  onRaise: (postId: string, amount: number) => void;
  raising: boolean;
}

export function RaiseBountyControl({ post, replyId, ask, onRaise, raising }: RaiseBountyControlProps) {
  const current = currentBounty(post);
  const [amount, setAmount] = useState('');
  const custom = parseRaiseAmount(amount, current);
  /* A raise must exceed the bounty; once the ask is met, only the free amount is offered. */
  const meetsAsk = ask > current;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`raise-bounty-${replyId}`}>
      {meetsAsk && (
        <button
          type="button"
          className={BUTTON_CLS}
          disabled={raising}
          onClick={() => onRaise(post.id, ask)}
          data-testid={`raise-bounty-${replyId}-ask`}
        >
          <Icon name="trending-up" size="sm" /> Raise bounty to {ask}
        </button>
      )}
      <input
        type="number"
        min={current + 1}
        step={1}
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder={`Above ${current}`}
        disabled={raising}
        className={INPUT_CLS}
        aria-label="Raise bounty to a custom amount"
        data-testid={`raise-bounty-${replyId}-amount`}
      />
      <button
        type="button"
        className={BUTTON_CLS}
        disabled={raising || custom === null}
        onClick={() => custom !== null && onRaise(post.id, custom)}
        data-testid={`raise-bounty-${replyId}-custom`}
      >
        Raise
      </button>
    </div>
  );
}
