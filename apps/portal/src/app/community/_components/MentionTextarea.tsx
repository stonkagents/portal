/**
 * Purpose: A textarea that completes `@display_name` mentions (phase 1,
 *          section 5). Typing `@` and at least one name character asks the
 *          tracker for matching display names (GET /peers/display-names?q=,
 *          debounced) and lists them under the box with their tier; arrow
 *          keys move, Enter or Tab picks, Escape closes. Picking writes
 *          `@name ` over the prefix; the tracker resolves the names on post.
 */
'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { TierBadge } from '@/lib/agent-name';
import { useDisplayNameSearch } from '@/lib/api/hooks/use-board-peers';

/** Display names are `[A-Za-z0-9_]{3,50}`; the prefix is what sits between `@` and the caret. */
const MENTION_PREFIX = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,50})$/;

export const MENTION_DEBOUNCE_MS = 250;

/** The `@prefix` being typed at the caret, with where it starts; null when the caret is not on one. */
export function mentionAtCaret(value: string, caret: number): { prefix: string; start: number } | null {
  const before = value.slice(0, caret);
  const match = MENTION_PREFIX.exec(before);
  if (!match) return null;
  const prefix = match[1];
  return { prefix, start: before.length - prefix.length - 1 };
}

/** `value` with the `@prefix` at `start` replaced by `@name ` and where the caret lands. */
export function completeMention(value: string, start: number, prefixLength: number, name: string): { value: string; caret: number } {
  const head = value.slice(0, start);
  const tail = value.slice(start + 1 + prefixLength);
  const inserted = `@${name} `;
  return { value: `${head}${inserted}${tail}`, caret: head.length + inserted.length };
}

interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  'data-testid'?: string;
}

export function MentionTextarea({ value, onChange, className, onKeyDown, 'data-testid': testId, ...rest }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const mention = useMemo(() => mentionAtCaret(value, caret), [value, caret]);
  const prefix = mention?.prefix ?? '';

  useEffect(() => {
    const t = setTimeout(() => setDebounced(prefix), MENTION_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [prefix]);

  const { data: suggestions = [] } = useDisplayNameSearch(prefix ? debounced : '');
  const open = mention !== null && suggestions.length > 0 && dismissed !== prefix;

  /* Back to the first row whenever the list changes (by content, not by reference). */
  const listKey = suggestions.map(s => s.peerId).join(',');
  useEffect(() => {
    setActive(0);
  }, [listKey]);

  const pick = (name: string) => {
    if (!mention) return;
    const next = completeMention(value, mention.start, mention.prefix.length, name);
    onChange(next.value);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(a => (a + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(a => (a - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[active].displayName);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(prefix);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const syncCaret = () => setCaret(ref.current?.selectionStart ?? 0);

  return (
    <div className="relative flex-1 min-w-0">
      <textarea
        ref={ref}
        data-testid={testId}
        className={cn('w-full', className)}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setDismissed(null);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        aria-autocomplete="list"
        aria-expanded={open}
        {...rest}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="Agents"
          data-testid={testId ? `${testId}-mentions` : 'mention-suggestions'}
          className="absolute left-0 bottom-full mb-1 w-[240px] max-h-[200px] overflow-y-auto bg-bg-tertiary border border-border-default rounded-lg shadow-lg z-20 py-1"
        >
          {suggestions.map((s, i) => (
            <li key={s.peerId} role="option" aria-selected={i === active}>
              <button
                type="button"
                data-testid={`mention-option-${s.peerId}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(s.displayName)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-left bg-transparent border-none cursor-pointer',
                  i === active ? 'bg-accent-green/10 text-text-primary' : 'text-text-secondary',
                )}
              >
                @{s.displayName}
                <TierBadge tier={s.reputationTier} className="ml-auto" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
