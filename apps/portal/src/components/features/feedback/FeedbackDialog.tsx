/**
 * Purpose: The feedback dialog (FB-1), ported from agenthood's chrome/FeedbackDialog.
 *
 * Posts to the tracker's feedback endpoint carrying the route the user was on,
 * so a report is actionable without asking where they were. Never fakes
 * success: a failed post surfaces the error and keeps their text.
 *
 * Contact stays optional. What it validates is legibility: "@bob" alone never
 * says where bob lives, so a bare handle asks for a platform; email and phone
 * self-describe. An unreadable contact only warns, it never blocks the send.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useWalletService } from '@/lib/wallet';
import { postFeedback, FEEDBACK_MAX_CONTACT, FEEDBACK_MAX_MESSAGE, type FeedbackKind } from '@/lib/api/feedback';
import { classifyContact, HANDLE_PLATFORMS, type ContactPlatform } from './contact';
import { TurnstileBox, TURNSTILE_FAILED_NOTE, type TurnstileState } from './TurnstileBox';
import type { FeedbackPrefill } from './feedback-request';
import { openInterest } from '@/components/features/interest/interest-request';

type Status = { s: 'idle' } | { s: 'sending' } | { s: 'sent' } | { s: 'error'; msg: string };

export const FEEDBACK_TITLE = 'Say what’s off';
export const FEEDBACK_SENT = 'Got it. Thanks for making the Network better.';
/** Under the "An idea" chip: an agent capability wish is roadmap interest, not feedback (RI-1). */
const FEEDBACK_ROADMAP_HINT = 'Is it something you want your agent to do?';
const FEEDBACK_ROADMAP_LINK = 'Use the roadmap form';

/** The message prompt follows the chip: "what happened?" fits a bug report and nothing else. */
const KINDS: { key: FeedbackKind; label: string; prompt: string; placeholder: string }[] = [
  { key: 'bug', label: 'Something broke', prompt: 'What happened?', placeholder: 'The more specific, the faster it gets fixed.' },
  { key: 'idea', label: 'An idea', prompt: 'What’s your idea?', placeholder: 'What should exist, and why?' },
  { key: 'other', label: 'Something else', prompt: 'What’s on your mind?', placeholder: 'Anything. All of it gets read.' },
];

/** The coming-soon kind has no chip; the dialog opens straight on its question. */
const WANTED = {
  key: 'wanted' as const,
  label: 'What you wanted',
  prompt: 'What were you looking for?',
  placeholder: 'What did you expect to find here?',
};

const CHIP =
  'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer';
const CHIP_ON = 'border-accent-green bg-accent-green/12 text-accent-green';
const CHIP_OFF = 'border-border-default bg-transparent text-text-secondary hover:text-text-primary hover:border-border-hover';
const FIELD =
  'w-full rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-green/50';
const CAP = 'block text-xs font-semibold uppercase tracking-wide text-text-tertiary';

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  prefill?: FeedbackPrefill;
  /** Changes on every open; resets the form. */
  seq?: number;
}

export function FeedbackDialog({ open, onClose, prefill, seq = 0 }: FeedbackDialogProps) {
  const pathname = usePathname() ?? '/';
  const wallet = useWalletService();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [platform, setPlatform] = useState<ContactPlatform | null>(null);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsState, setTsState] = useState<TurnstileState>('off');
  const [status, setStatus] = useState<Status>({ s: 'idle' });
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Every open starts clean, with whatever the caller pre-filled. */
  useEffect(() => {
    if (!open) return;
    setKind(prefill?.kind ?? 'bug');
    setMessage(prefill?.message ?? '');
    setContact('');
    setPlatform(null);
    setStatus({ s: 'idle' });
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, seq, prefill?.kind, prefill?.message]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const onToken = useCallback((t: string | null) => setTsToken(t), []);
  const onTsState = useCallback((s: TurnstileState) => setTsState(s), []);

  const path = prefill?.path ?? pathname;
  const active = kind === 'wanted' ? WANTED : (KINDS.find(k => k.key === kind) ?? KINDS[0]);
  const contactClass = classifyContact(contact);
  const contactVia: ContactPlatform | undefined =
    contactClass.kind === 'email' || contactClass.kind === 'phone'
      ? contactClass.kind
      : contactClass.kind === 'handle' && platform
        ? platform
        : undefined;

  async function submit() {
    const body = message.trim();
    if (!body) return;
    /* A widget that never loaded means a post that would be refused: say so, with the text kept. */
    if (tsState === 'failed' && !tsToken) {
      setStatus({ s: 'error', msg: TURNSTILE_FAILED_NOTE });
      return;
    }
    setStatus({ s: 'sending' });
    try {
      await postFeedback(
        {
          kind,
          message: body,
          path,
          contact: contact.trim() || undefined,
          contactVia,
          walletAddress: wallet.connected && wallet.publicKey ? wallet.publicKey : undefined,
        },
        tsToken,
      );
      setStatus({ s: 'sent' });
      closeTimer.current = setTimeout(onClose, 1400);
    } catch (err) {
      setStatus({ s: 'error', msg: err instanceof Error ? err.message : 'Could not send' });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={FEEDBACK_TITLE} maxWidth="max-w-md">
      <div className="flex flex-col gap-4" data-testid="feedback-dialog">
        {status.s === 'sent' ? (
          <p className="m-0 py-3 text-sm text-text-primary" data-testid="feedback-sent" role="status">
            {FEEDBACK_SENT}
          </p>
        ) : (
          <>
            {kind !== 'wanted' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Feedback type" data-testid="feedback-kinds">
                {KINDS.map(k => (
                  <button
                    key={k.key}
                    type="button"
                    className={cn(CHIP, kind === k.key ? CHIP_ON : CHIP_OFF)}
                    aria-pressed={kind === k.key}
                    onClick={() => setKind(k.key)}
                    data-testid={`feedback-kind-${k.key}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={CAP}>{active.prompt}</span>
              <textarea
                ref={firstFieldRef}
                rows={4}
                value={message}
                maxLength={FEEDBACK_MAX_MESSAGE}
                onChange={e => setMessage(e.target.value)}
                placeholder={active.placeholder}
                className={cn(FIELD, 'resize-y')}
                data-testid="feedback-message"
              />
            </label>
            {kind === 'idea' && (
              <p className="m-0 -mt-2 text-xs text-text-tertiary" data-testid="feedback-roadmap-hint">
                {FEEDBACK_ROADMAP_HINT}{' '}
                <button
                  type="button"
                  onClick={() => {
                    /* Carry the text over; the interest dialog is a separate host, so close this one first. */
                    onClose();
                    openInterest({ description: message.trim() || undefined, path });
                  }}
                  className="inline min-h-[44px] cursor-pointer border-none bg-transparent p-0 font-semibold text-accent-green underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green"
                  data-testid="feedback-roadmap-link"
                >
                  {FEEDBACK_ROADMAP_LINK}
                </button>
              </p>
            )}

            {/* Not a <label> wrapper: the platform chips are buttons, and a button inside a label re-targets clicks. */}
            <div className="flex flex-col gap-1.5">
              <label className={CAP} htmlFor="feedback-contact">
                Contact (optional)
              </label>
              <input
                id="feedback-contact"
                value={contact}
                maxLength={FEEDBACK_MAX_CONTACT}
                onChange={e => setContact(e.target.value)}
                placeholder="Email, +phone or @handle, if you want a reply"
                className={cn(FIELD, 'min-h-[44px]')}
                data-testid="feedback-contact"
              />
              {contactClass.kind === 'email' && <p className="m-0 text-xs text-text-tertiary">Reads as an email.</p>}
              {contactClass.kind === 'phone' && <p className="m-0 text-xs text-text-tertiary">Reads as a phone number.</p>}
              {contactClass.kind === 'invalid' && (
                <p className="m-0 text-xs text-accent-yellow" role="note" data-testid="feedback-contact-hint">
                  {contactClass.hint}
                </p>
              )}
              {contactClass.kind === 'handle' && (
                <>
                  {!platform && (
                    <p className="m-0 text-xs text-accent-yellow" role="note" data-testid="feedback-contact-hint">
                      Which platform is that handle on?
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Handle platform" data-testid="feedback-platforms">
                    {HANDLE_PLATFORMS.map(p => (
                      <button
                        key={p.key}
                        type="button"
                        className={cn(CHIP, 'font-mono', platform === p.key ? CHIP_ON : CHIP_OFF)}
                        aria-pressed={platform === p.key}
                        onClick={() => setPlatform(p.key)}
                        data-testid={`feedback-platform-${p.key}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <TurnstileBox onToken={onToken} onState={onTsState} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-xs text-text-tertiary" data-testid="feedback-path">
                from {path}
              </span>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={status.s === 'sending' || !message.trim()}
                loading={status.s === 'sending'}
                data-testid="feedback-send"
              >
                {status.s === 'sending' ? 'Sending…' : 'Send'}
              </Button>
            </div>
            {status.s === 'error' && (
              <p className="m-0 font-mono text-xs text-accent-red" role="alert" data-testid="feedback-error">
                {status.msg} Your text is still here, try again.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
