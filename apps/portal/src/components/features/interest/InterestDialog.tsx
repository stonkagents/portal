/**
 * Purpose: The roadmap interest dialog (RI-1).
 *
 * Not feedback. A coming-soon surface asking "what should your agent be able
 * to do?" collects product interest that development mines per capability, so
 * the form is a fixed grid of capability chips (multi-select), a short free
 * text, a priority, and the route and wallet attached automatically.
 *
 * Never fakes success: the client requires `{ ok: true }`, and a failed post
 * keeps every selection and shows the error. When the tracker returns counts,
 * the success state reads them back as a live tally per selected capability.
 *
 * Contact stays optional and reuses the feedback contact classifier: a bare
 * handle asks for a platform, email and phone self-describe.
 */
'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Icon, Modal } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useWalletService } from '@/lib/wallet';
import {
  postInterest,
  INTEREST_CAPABILITIES,
  INTEREST_MAX_CONTACT,
  INTEREST_MAX_DESCRIPTION,
  INTEREST_PRIORITIES,
  type InterestCapability,
  type InterestPriority,
  type InterestResult,
} from '@/lib/api/interest';
import { classifyContact, HANDLE_PLATFORMS, type ContactPlatform } from '@/components/features/feedback/contact';
import { TurnstileBox, TURNSTILE_FAILED_NOTE, type TurnstileState } from '@/components/features/feedback/TurnstileBox';
import type { InterestPrefill } from './interest-request';

type Status = { s: 'idle' } | { s: 'sending' } | { s: 'sent'; counts?: InterestResult['counts'] } | { s: 'error'; msg: string };

export const INTEREST_TITLE = 'What should your agent be able to do?';
const INTEREST_LEDE = 'Pick everything you’d actually use. It goes straight to the roadmap.';
export const INTEREST_LOGGED = 'Logged. We build what agents ask for.';

/* Chips and radios move only on transform/opacity; colour states switch without a tween. */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green';
const CAP_CHIP =
  'group flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left cursor-pointer select-none transition-transform duration-150 active:scale-[0.985]';
const CAP_ON = 'border-accent-green bg-accent-green/10';
const CAP_OFF = 'border-border-default bg-bg-tertiary hover:border-border-hover';
const PILL =
  'inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border px-3 text-xs font-semibold cursor-pointer select-none transition-transform duration-150 active:scale-[0.97]';
const PILL_ON = 'border-accent-green bg-accent-green/12 text-accent-green';
const PILL_OFF = 'border-border-default bg-transparent text-text-secondary hover:text-text-primary hover:border-border-hover';
const MINI_CHIP =
  'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-xs font-mono font-semibold cursor-pointer select-none';
const FIELD =
  'w-full rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-green/50';
const EYEBROW = 'block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary';

export interface InterestDialogProps {
  open: boolean;
  onClose: () => void;
  prefill?: InterestPrefill;
  /** Changes on every open; resets the form. */
  seq?: number;
}

function shortWallet(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

/** "12 agents want this" / "1 agent wants this" — the tally line under a capability on success. */
export function tallyLine(n: number): string {
  return n === 1 ? '1 agent wants this' : `${n.toLocaleString()} agents want this`;
}

export function InterestDialog({ open, onClose, prefill, seq = 0 }: InterestDialogProps) {
  const pathname = usePathname() ?? '/';
  const wallet = useWalletService();
  const [selected, setSelected] = useState<InterestCapability[]>([]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<InterestPriority | null>(null);
  const [contact, setContact] = useState('');
  const [platform, setPlatform] = useState<ContactPlatform | null>(null);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsState, setTsState] = useState<TurnstileState>('off');
  const [status, setStatus] = useState<Status>({ s: 'idle' });
  const firstChipRef = useRef<HTMLButtonElement>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* Every open starts clean, with whatever the caller pre-filled. */
  const prefillCaps = prefill?.capabilities;
  const prefillDescription = prefill?.description;
  useEffect(() => {
    if (!open) return;
    setSelected(prefillCaps ?? []);
    setDescription(prefillDescription ?? '');
    setPriority(null);
    setContact('');
    setPlatform(null);
    setStatus({ s: 'idle' });
    const t = setTimeout(() => firstChipRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, seq, prefillCaps, prefillDescription]);

  const path = prefill?.path ?? pathname;
  const walletAddress = wallet.connected && wallet.publicKey ? wallet.publicKey : undefined;
  const otherPicked = selected.includes('other');
  const describeRequired = otherPicked && !description.trim();
  const canSend = selected.length > 0 && priority !== null && !describeRequired;

  const contactClass = classifyContact(contact);
  const contactVia: ContactPlatform | undefined =
    contactClass.kind === 'email' || contactClass.kind === 'phone'
      ? contactClass.kind
      : contactClass.kind === 'handle' && platform
        ? platform
        : undefined;

  const toggle = useCallback((key: InterestCapability) => {
    setSelected(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  }, []);

  const onToken = useCallback((t: string | null) => setTsToken(t), []);
  const onTsState = useCallback((s: TurnstileState) => setTsState(s), []);

  /* Arrow keys walk the priority radios, as a native radiogroup would. */
  const onRadioKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + INTEREST_PRIORITIES.length) % INTEREST_PRIORITIES.length;
    setPriority(INTEREST_PRIORITIES[next].key);
    radioRefs.current[next]?.focus();
  };

  async function submit() {
    if (!canSend || priority === null) return;
    /* A widget that never loaded means a post that would be refused: say so, with the picks kept. */
    if (tsState === 'failed' && !tsToken) {
      setStatus({ s: 'error', msg: TURNSTILE_FAILED_NOTE });
      return;
    }
    setStatus({ s: 'sending' });
    try {
      const result = await postInterest(
        {
          capabilities: selected,
          description: description.trim(),
          priority,
          contact: contact.trim() || undefined,
          contactVia,
          walletAddress,
          path,
        },
        tsToken,
      );
      setStatus({ s: 'sent', counts: result.counts });
    } catch (err) {
      setStatus({ s: 'error', msg: err instanceof Error ? err.message : 'Could not send' });
    }
  }

  const sending = status.s === 'sending';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={INTEREST_TITLE}
      maxWidth="max-w-xl"
      /* Phone width: a bottom sheet; the body scrolls inside the sheet, never the page. */
      className="overflow-y-auto max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[92vh] max-sm:rounded-b-none max-sm:rounded-t-2xl"
    >
      <div className="flex flex-col gap-5" data-testid="interest-dialog">
        {status.s === 'sent' ? (
          <div className="flex flex-col gap-4 py-2" role="status" data-testid="interest-sent">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-green/12 text-accent-green">
                <Icon name="check" size="sm" />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-base font-semibold text-text-primary">{INTEREST_LOGGED}</p>
                <p className="m-0 mt-1 text-sm text-text-secondary">Roadmap interest is read per capability, so every pick counts.</p>
              </div>
            </div>
            {status.counts && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="interest-tally">
                {INTEREST_CAPABILITIES.filter(c => selected.includes(c.key) && status.counts?.[c.key] !== undefined).map(c => (
                  <li
                    key={c.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2"
                    data-testid={`interest-tally-${c.key}`}
                  >
                    <span className="text-sm text-text-primary">{c.label}</span>
                    <span className="font-mono text-xs text-accent-green">{tallyLine(status.counts?.[c.key] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={onClose} data-testid="interest-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className={EYEBROW}>Roadmap interest</span>
              <p className="m-0 text-sm text-text-secondary">{INTEREST_LEDE}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className={EYEBROW} id="interest-capabilities-label">
                Capabilities · pick any
              </span>
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                role="group"
                aria-labelledby="interest-capabilities-label"
                data-testid="interest-capabilities"
              >
                {INTEREST_CAPABILITIES.map((c, i) => {
                  const on = selected.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      ref={i === 0 ? firstChipRef : undefined}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(c.key)}
                      className={cn(CAP_CHIP, FOCUS, on ? CAP_ON : CAP_OFF)}
                      data-testid={`interest-cap-${c.key}`}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                          on
                            ? 'border-accent-green bg-accent-green text-black'
                            : 'border-border-hover bg-transparent text-transparent',
                        )}
                      >
                        <Icon name="check" size="sm" className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('text-sm font-semibold leading-tight', on ? 'text-text-primary' : 'text-text-secondary')}>
                          {c.label}
                        </span>
                        <span className={cn('font-mono text-[11px] leading-tight', on ? 'text-accent-green' : 'text-text-tertiary')}>
                          {c.tag}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label className={EYEBROW} htmlFor="interest-description">
                  Describe it{otherPicked ? '' : ' · optional'}
                </label>
                <span className="font-mono text-[11px] text-text-tertiary" aria-live="polite" data-testid="interest-counter">
                  {description.length}/{INTEREST_MAX_DESCRIPTION}
                </span>
              </div>
              <textarea
                id="interest-description"
                rows={3}
                value={description}
                maxLength={INTEREST_MAX_DESCRIPTION}
                onChange={e => setDescription(e.target.value)}
                placeholder="What would it do, and when would you reach for it?"
                className={cn(FIELD, 'resize-y')}
                data-testid="interest-description"
              />
              {describeRequired && (
                <p className="m-0 text-xs text-accent-yellow" role="note" data-testid="interest-describe-hint">
                  “Something else” needs a line so we know what it is.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className={EYEBROW} id="interest-priority-label">
                How much would this matter?
              </span>
              <div
                className="flex flex-col gap-2 sm:flex-row"
                role="radiogroup"
                aria-labelledby="interest-priority-label"
                data-testid="interest-priority"
              >
                {INTEREST_PRIORITIES.map((p, i) => (
                  <button
                    key={p.key}
                    ref={el => {
                      radioRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={priority === p.key}
                    tabIndex={priority === null ? (i === 0 ? 0 : -1) : priority === p.key ? 0 : -1}
                    onClick={() => setPriority(p.key)}
                    onKeyDown={e => onRadioKey(e, i)}
                    className={cn(PILL, FOCUS, priority === p.key ? PILL_ON : PILL_OFF)}
                    data-testid={`interest-priority-${p.key}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Not a <label> wrapper: the platform chips are buttons, and a button inside a label re-targets clicks. */}
            <div className="flex flex-col gap-1.5">
              <label className={EYEBROW} htmlFor="interest-contact">
                Contact · optional
              </label>
              <input
                id="interest-contact"
                value={contact}
                maxLength={INTEREST_MAX_CONTACT}
                onChange={e => setContact(e.target.value)}
                placeholder="Email, +phone or @handle, if you want to hear when it ships"
                className={cn(FIELD, 'min-h-[44px]')}
                data-testid="interest-contact"
              />
              {contactClass.kind === 'email' && <p className="m-0 text-xs text-text-tertiary">Reads as an email.</p>}
              {contactClass.kind === 'phone' && <p className="m-0 text-xs text-text-tertiary">Reads as a phone number.</p>}
              {contactClass.kind === 'invalid' && (
                <p className="m-0 text-xs text-accent-yellow" role="note" data-testid="interest-contact-hint">
                  {contactClass.hint}
                </p>
              )}
              {contactClass.kind === 'handle' && (
                <>
                  {!platform && (
                    <p className="m-0 text-xs text-accent-yellow" role="note" data-testid="interest-contact-hint">
                      Which platform is that handle on?
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Handle platform" data-testid="interest-platforms">
                    {HANDLE_PLATFORMS.map(p => (
                      <button
                        key={p.key}
                        type="button"
                        className={cn(MINI_CHIP, FOCUS, platform === p.key ? PILL_ON : PILL_OFF)}
                        aria-pressed={platform === p.key}
                        onClick={() => setPlatform(p.key)}
                        data-testid={`interest-platform-${p.key}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <TurnstileBox onToken={onToken} onState={onTsState} />

            <div className="flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-text-tertiary">
                <span data-testid="interest-path">from {path}</span>
                {walletAddress && (
                  <span data-testid="interest-wallet" title={walletAddress}>
                    wallet {shortWallet(walletAddress)}
                  </span>
                )}
              </span>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={sending || !canSend}
                loading={sending}
                data-testid="interest-send"
              >
                {sending ? 'Logging…' : 'Log my interest'}
              </Button>
            </div>
            {status.s === 'error' && (
              <p className="m-0 font-mono text-xs text-accent-red" role="alert" data-testid="interest-error">
                {status.msg} Your picks are still here, try again.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
