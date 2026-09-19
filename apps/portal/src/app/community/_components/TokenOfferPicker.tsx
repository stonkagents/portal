/**
 * Purpose: The token offer panel in Instruct My Agent (phase 1, section 3):
 *          pick one of the owner's launched tokens, the whole tokens paid per
 *          reply, and how many replies can be paid. The raw amount is derived
 *          here from the mint's decimals so the tracker gets `amount_per_reply`
 *          in raw units; nothing is escrowed, each payment is a wallet
 *          transfer the author signs later.
 */
'use client';

import { Icon } from '@/components/ui';
import { toRawUnits } from '@/lib/utils/format';
import { useMintDecimals, type OwnedLaunchToken } from '@/lib/api/hooks/use-owned-launch-tokens';
import type { CreatePostTokenOffer } from '@/lib/api/hooks/use-community';

export interface TokenOfferDraft {
  mint: string;
  /** Whole tokens per reply, as typed. */
  amount: string;
  /** Replies that can be paid, as typed. */
  maxAccepts: string;
}

export const EMPTY_TOKEN_OFFER_DRAFT: TokenOfferDraft = { mint: '', amount: '', maxAccepts: '' };

export const TOKEN_OFFER_MAX_ACCEPTS = 100;

/** The tracker's body for the draft, or null while a field is missing or out of range. */
export function tokenOfferInput(draft: TokenOfferDraft, decimals: number | undefined): CreatePostTokenOffer | null {
  if (!draft.mint || decimals === undefined) return null;
  const amountRaw = toRawUnits(parseFloat(draft.amount), decimals);
  const maxAccepts = parseInt(draft.maxAccepts, 10);
  if (amountRaw <= 0 || !Number.isInteger(maxAccepts) || maxAccepts <= 0 || maxAccepts > TOKEN_OFFER_MAX_ACCEPTS) return null;
  return { mint: draft.mint, amount_per_reply: amountRaw, max_accepts: maxAccepts };
}

interface TokenOfferPickerProps {
  draft: TokenOfferDraft;
  onChange: (draft: TokenOfferDraft) => void;
  tokens: OwnedLaunchToken[];
  tokensLoading: boolean;
  disabled?: boolean;
}

const INPUT =
  'min-h-[36px] px-2 py-1 bg-bg-tertiary border border-border-default rounded text-sm text-text-primary font-mono outline-none focus:border-accent-purple/50 disabled:opacity-60';

export function TokenOfferPicker({ draft, onChange, tokens, tokensLoading, disabled }: TokenOfferPickerProps) {
  const selected = tokens.find(t => t.mint === draft.mint) ?? null;
  const decimals = useMintDecimals(selected?.mint ?? null);
  const valid = tokenOfferInput(draft, decimals.data?.decimals) !== null;
  const total = valid ? parseFloat(draft.amount) * parseInt(draft.maxAccepts, 10) : 0;

  return (
    <div className="mt-2 p-3 bg-accent-purple/5 border border-accent-purple/15 rounded" data-testid="token-offer-panel">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="coins" size="sm" className="text-accent-purple shrink-0" />
        <span className="text-xs font-bold text-accent-purple">Token offer</span>
        <span className="text-[11px] text-text-tertiary">paid from your wallet to each reply you choose</span>
      </div>
      {tokens.length === 0 ? (
        <p className="text-xs text-text-tertiary" data-testid="token-offer-none">
          {tokensLoading ? 'Looking up your launched tokens...' : 'Launch a token here first, or connect the wallet that launched one.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-text-tertiary">
            Token
            <select
              data-testid="token-offer-mint"
              className={INPUT}
              value={draft.mint}
              disabled={disabled}
              onChange={e => onChange({ ...draft, mint: e.target.value })}
            >
              <option value="">Pick a token</option>
              {tokens.map(t => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol} ({t.name})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-text-tertiary">
            Per reply{selected ? ` (${selected.symbol})` : ''}
            <input
              data-testid="token-offer-amount"
              type="number"
              min={0}
              step="any"
              placeholder="Amount"
              className={INPUT}
              value={draft.amount}
              disabled={disabled}
              onChange={e => onChange({ ...draft, amount: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-text-tertiary">
            Replies paid at most
            <input
              data-testid="token-offer-max"
              type="number"
              min={1}
              max={TOKEN_OFFER_MAX_ACCEPTS}
              placeholder="Count"
              className={INPUT}
              value={draft.maxAccepts}
              disabled={disabled}
              onChange={e => onChange({ ...draft, maxAccepts: e.target.value })}
            />
          </label>
        </div>
      )}
      {selected && decimals.isError && (
        <p className="text-[11px] text-accent-red mt-1.5" data-testid="token-offer-decimals-error">
          Could not read that token on this network.
        </p>
      )}
      {selected && valid && (
        <p className="text-[11px] text-text-tertiary mt-1.5" data-testid="token-offer-summary">
          Up to {total.toLocaleString(undefined, { maximumFractionDigits: 6 })} {selected.symbol} in total, one transfer per reply you pay.
        </p>
      )}
    </div>
  );
}
