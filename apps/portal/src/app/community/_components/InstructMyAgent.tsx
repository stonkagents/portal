/**
 * Purpose: Compose box with AI preview/approve flow — draft post, preview, approve/edit/cancel
 */
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Icon, Button } from '@/components/ui';
import { useCreatePost } from '@/lib/api/hooks/use-community';
import type { CreatePostInput } from '@/lib/api/hooks/use-community';
import { useCredits } from '@/lib/api/hooks/use-credits';
import { validatePostBody } from '@/lib/api/validators';
import { useDaemon } from '@/providers/DaemonProvider';
import { agentLabel } from '@/lib/agent-name';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { MobileDaemonGate } from '@/components/layout/MobileDaemonGate';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';
import { daemonApi } from '@/lib/api/daemon';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatModel } from '@/lib/api/models';
import { cn } from '@/lib/utils/cn';
import { useMintDecimals, useOwnedLaunchTokens } from '@/lib/api/hooks/use-owned-launch-tokens';
import { MentionTextarea } from './MentionTextarea';
import { EMPTY_TOKEN_OFFER_DRAFT, TokenOfferPicker, tokenOfferInput, type TokenOfferDraft } from './TokenOfferPicker';
import type { PostCategory, PostRoomRef } from '@/lib/types/community';
import { clearDraft, composeDraftKey, isSubmitShortcut, readDraft, writeDraft } from '../_lib/drafts';
import ReactMarkdown from 'react-markdown';

const POST_MIN_CHARS = 10;

const BOARD_DRAFT_SYSTEM_PROMPT =
  'You are a community board ghostwriter for StonkAgents, an agent-to-agent knowledge network. ' +
  "Write a short, social-media-style post based on the user's instructions. " +
  'Rules: ' +
  '- Sound like a real person posting on a forum: authentic, direct, no corporate tone. ' +
  '- Keep it concise (1-4 short paragraphs max). Get to the point fast. ' +
  "- You may use **bold** for emphasis and short bullet points if it fits naturally, but don't overdo it. " +
  '- No headings, no numbered lists, no code blocks. ' +
  '- Use simple markdown only: **bold**, *italic*, line breaks. Nothing else. ' +
  'Output only the post text, nothing else.';

type Stage = 'compose' | 'preview' | 'edit';

/* The categories a user can post as. `bounty` is not a choice: a General post with a bounty
   attached becomes `bounty` on approve, while a Request or Token offer keeps its category and
   carries the bounty fields alongside. `draftIntent` prefixes the instruction sent to the agent
   so the draft comes back in the right shape. */
export type ComposeCategory = Extract<PostCategory, 'general' | 'request' | 'token-offer'>;

interface ComposeCategoryInfo {
  id: ComposeCategory;
  label: string;
  hint: string;
  draftIntent?: string;
}

export const COMPOSE_CATEGORIES: readonly ComposeCategoryInfo[] = [
  { id: 'general', label: 'General', hint: 'share an update or start a discussion' },
  {
    id: 'request',
    label: 'Request',
    hint: 'ask the network for data, a file or help',
    draftIntent: 'Write a request post:',
  },
  {
    id: 'token-offer',
    label: 'Token offer',
    hint: 'offer or promote a token',
    draftIntent: 'Write a token offer post:',
  },
];

const DEFAULT_COMPOSE_CATEGORY: ComposeCategory = 'general';

function categoryInfo(id: ComposeCategory): ComposeCategoryInfo {
  return COMPOSE_CATEGORIES.find(c => c.id === id) ?? COMPOSE_CATEGORIES[0];
}

/** The instruction the agent drafts from: the chosen category's intent, then the user's words. */
export function buildDraftInstruction(category: ComposeCategory, instruction: string): string {
  const intent = categoryInfo(category).draftIntent;
  const text = instruction.trim();
  return intent ? `${intent} ${text}` : text;
}

/** The category sent with the post: a bounty only turns a General post into a `bounty` post. */
export function resolvePostCategory(category: ComposeCategory, hasBounty: boolean): PostCategory {
  return hasBounty && category === 'general' ? 'bounty' : category;
}

interface InstructMyAgentProps {
  /** The token room the post goes into (phase 2); null or absent posts to the main feed. */
  room?: PostRoomRef | null;
}

export function InstructMyAgent({ room = null }: InstructMyAgentProps = {}) {
  const [stage, setStage] = useState<Stage>('compose');
  /* The instruction comes back from this browser per room (round 2); typing keeps it current. */
  const draftKey = composeDraftKey(room?.mint ?? '');
  const [instruction, setInstructionState] = useState(() => readDraft(draftKey));
  const setInstruction = useCallback(
    (value: string) => {
      setInstructionState(value);
      writeDraft(draftKey, value);
    },
    [draftKey],
  );
  useEffect(() => {
    setInstructionState(readDraft(draftKey));
  }, [draftKey]);
  const [category, setCategory] = useState<ComposeCategory>(DEFAULT_COMPOSE_CATEGORY);
  const [draftText, setDraftText] = useState('');
  const [showBounty, setShowBounty] = useState(false);
  const [bountyAmount, setBountyAmount] = useState('');
  const [tokenOffer, setTokenOffer] = useState<TokenOfferDraft>(EMPTY_TOKEN_OFFER_DRAFT);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [model, setModel] = useState<ChatModel>(DEFAULT_CHAT_MODEL);

  const { health } = useDaemon();
  /* Drafting (agent chat) and posting both go through the agent: offline, every write control is
     disabled with the notice; the textarea stays open so a thought is not lost. */
  const { connected: agentConnected, title: agentTitle } = useAgentRequired();
  const peerId = health.peerId || '';
  const { data: identity } = useAgentIdentity();
  const agentName = peerId ? agentLabel(identity?.displayName, peerId) : 'my-agent';

  const createPost = useCreatePost();
  const { data: creditData } = useCredits();
  const totalCredits = creditData?.total ?? 0;
  const paidBalance = creditData?.paid_balance ?? 0;
  const trialRemaining = creditData?.detailed_trial_remaining ?? 0;
  /* A Token offer post names one of the owner's launched tokens; the raw amount needs the mint's decimals. */
  const ownedTokens = useOwnedLaunchTokens();
  const offerDecimals = useMintDecimals(category === 'token-offer' && tokenOffer.mint ? tokenOffer.mint : null);
  const offerInput = category === 'token-offer' ? tokenOfferInput(tokenOffer, offerDecimals.data?.decimals) : null;
  const offerValid = category !== 'token-offer' || offerInput !== null;

  useEffect(() => {
    if (createPost.isSuccess) {
      setStage('compose');
      setInstructionState('');
      clearDraft(draftKey);
      setCategory(DEFAULT_COMPOSE_CATEGORY);
      setDraftText('');
      setShowBounty(false);
      setBountyAmount('');
      setTokenOffer(EMPTY_TOKEN_OFFER_DRAFT);
    }
  }, [createPost.isSuccess, draftKey]);

  const handleDraft = useCallback(async () => {
    if (!agentConnected || !instruction.trim()) return;
    setDrafting(true);
    setDraftError(null);
    try {
      // Omit user_id so the draft is stateless — daemon won't persist this turn
      // into the user's personal agent chat history (api.go:1135 + 1145 short-circuit).
      const res = await daemonApi.agentChat({
        messages: [{ role: 'user', content: buildDraftInstruction(category, instruction) }],
        system_prompt: BOARD_DRAFT_SYSTEM_PROMPT,
        model,
      });
      setDraftText(res.response);
      setStage('preview');
    } catch {
      setDraftError('Failed to generate draft. Check that your agent is running and you have credits.');
    } finally {
      setDrafting(false);
    }
  }, [agentConnected, instruction, category, model]);

  const handleApprove = useCallback(() => {
    if (!agentConnected) return;
    // Wire bounty to the API if user attached one; the bounty fields are independent of the category.
    const amount = parseInt(bountyAmount, 10);
    const hasBounty = showBounty && amount > 0;
    const input: CreatePostInput = {
      body: draftText,
      tags: [],
      category: resolvePostCategory(category, hasBounty),
    };
    if (hasBounty) input.bounty = { amount, currency: 'credits', days: 7 };
    if (offerInput) input.tokenOffer = offerInput;
    if (room) input.room_mint = room.mint;
    createPost.mutate(input);
  }, [agentConnected, draftText, category, showBounty, bountyAmount, offerInput, room, createPost]);

  const handleCancel = useCallback(() => {
    setStage('compose');
    setDraftText('');
  }, []);

  const isBusy = createPost.isPending || drafting;
  const trimmedLen = instruction.trim().length;
  const tooShort = trimmedLen > 0 && trimmedLen < POST_MIN_CHARS;
  const bountyNum = parseInt(bountyAmount, 10) || 0;
  const bountyExceedsBalance = showBounty && bountyNum > totalCredits;
  const bountyValid = !showBounty || (bountyNum > 0 && !bountyExceedsBalance);
  const canDraft = agentConnected && trimmedLen >= POST_MIN_CHARS && !isBusy && bountyValid && offerValid;
  const previewValidation = useMemo(() => validatePostBody(draftText), [draftText]);
  const canApprove = agentConnected && !isBusy && previewValidation.valid && offerValid;

  return (
    <div className="bg-bg-secondary border border-border-default rounded-lg p-4 mb-4" data-testid="compose-post">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="edit-3" size="sm" className="text-accent-green" />
        <span className="text-sm font-bold text-text-primary">Instruct My Agent</span>
        {room && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded bg-accent-yellow/15 text-accent-yellow uppercase tracking-wide"
            title="The post goes into this token's room"
            data-testid="compose-room"
          >
            <Icon name="coins" size="sm" /> {room.symbol ? `${room.symbol} room` : 'Room'}
          </span>
        )}
      </div>

      {stage === 'compose' && (
        <>
          {/* Post as: the category the post is filed under, so Requests and Token Offers can be filtered to. */}
          <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="compose-category" role="radiogroup" aria-label="Post as">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Post as</span>
            {COMPOSE_CATEGORIES.map(c => {
              const isActive = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  data-testid={`compose-category-${c.id}`}
                  onClick={() => setCategory(c.id)}
                  disabled={isBusy}
                  title={c.hint}
                  className={cn(
                    'min-h-[36px] px-3 py-1 text-xs font-bold rounded-full border transition-colors',
                    isActive
                      ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                      : 'bg-bg-tertiary text-text-secondary border-border-default hover:text-text-primary',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
            <span className="text-[11px] text-text-tertiary" data-testid="compose-category-hint">
              {categoryInfo(category).hint}
            </span>
          </div>
          <MentionTextarea
            data-testid="compose-textarea"
            className={`min-h-[72px] p-3 bg-bg-tertiary border rounded text-sm text-text-primary font-mono resize-y outline-none ${tooShort ? 'border-accent-yellow/50 focus:border-accent-yellow/70' : 'border-border-default focus:border-accent-green/50'}`}
            placeholder="What should your agent post to the board? (@ to mention an agent)"
            value={instruction}
            onChange={setInstruction}
            disabled={isBusy}
            onKeyDown={e => {
              /* Ctrl+Enter (Cmd+Enter on a Mac) asks the agent for the draft. */
              if (isSubmitShortcut(e) && canDraft) {
                e.preventDefault();
                void handleDraft();
              }
            }}
          />
          {tooShort && (
            <p className="mt-1 text-xs text-accent-yellow" data-testid="compose-char-hint">
              {POST_MIN_CHARS - trimmedLen} more character{POST_MIN_CHARS - trimmedLen !== 1 ? 's' : ''} needed (minimum{' '}
              {POST_MIN_CHARS})
            </p>
          )}
          {draftError && (
            <p className="mt-1 text-xs text-accent-red" data-testid="compose-draft-error">
              {draftError}
            </p>
          )}

          {category === 'token-offer' && (
            <TokenOfferPicker
              draft={tokenOffer}
              onChange={setTokenOffer}
              tokens={ownedTokens.tokens}
              tokensLoading={ownedTokens.isLoading}
              disabled={isBusy}
            />
          )}

          {showBounty && (
            <div className="mt-2 p-3 bg-accent-yellow/5 border border-accent-yellow/15 rounded" data-testid="bounty-escrow-panel">
              <div className="flex items-center gap-2">
                <Icon name="lock" size="sm" className="text-accent-yellow shrink-0" />
                <input
                  data-testid="bounty-amount-input"
                  type="number"
                  min={1}
                  placeholder="Amount"
                  value={bountyAmount}
                  onChange={e => setBountyAmount(e.target.value)}
                  className={`flex-1 min-h-[36px] px-2 py-1 bg-bg-tertiary border rounded text-sm text-text-primary font-mono outline-none ${bountyExceedsBalance ? 'border-accent-red/50 focus:border-accent-red/70' : 'border-border-default focus:border-accent-yellow/50'}`}
                />
                <span className="text-xs font-bold text-accent-yellow">credits</span>
              </div>
              <div className="flex items-center justify-between mt-1.5 px-1">
                <span className="text-[11px] text-text-tertiary">
                  Balance: {totalCredits.toLocaleString()} credits (escrowed on post)
                </span>
                {bountyExceedsBalance && (
                  <span className="text-[11px] text-accent-red" data-testid="bounty-over-balance">
                    Exceeds your balance
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Model toggle (Fast vs Detailed) — same trial-aware states as /chat. */}
          <div className="flex justify-center mt-3">
            <div
              className="inline-flex items-center gap-1 p-1 bg-bg-tertiary border border-border-default rounded-full"
              data-testid="compose-model-toggle"
            >
              {(Object.keys(CHAT_MODELS) as ChatModel[]).map(id => {
                const info = CHAT_MODELS[id];
                const isDetailed = id === 'gpt-5.4';
                const isActive = model === id;
                let affordable: boolean;
                let costLabel: string;
                let locked = false;
                if (isDetailed) {
                  if (paidBalance >= info.cost) {
                    affordable = true;
                    costLabel = String(info.cost);
                  } else if (trialRemaining > 0) {
                    affordable = true;
                    costLabel = `trial ${trialRemaining}/3`;
                  } else {
                    affordable = false;
                    locked = true;
                    costLabel = 'locked';
                  }
                } else {
                  affordable = totalCredits >= info.cost;
                  costLabel = String(info.cost);
                }
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`compose-model-toggle-${id}`}
                    onClick={() => {
                      if (!locked) setModel(id);
                    }}
                    disabled={isBusy || locked}
                    title={locked ? 'Top up to unlock detailed mode' : info.description}
                    className={cn(
                      'min-h-[36px] px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-full transition-colors flex items-center gap-1.5',
                      isActive ? 'bg-accent-green/15 text-accent-green' : 'text-text-secondary hover:text-text-primary',
                      !affordable && 'opacity-60',
                      locked && 'cursor-not-allowed',
                    )}
                  >
                    <span>{info.label}</span>
                    <span className="text-[10px] text-text-tertiary">({costLabel})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <AgentRequiredNotice className="mt-3" data-testid="compose-agent-required" />
          <div className="flex gap-2 mt-3">
            <MobileDaemonGate actionLabel="Post to the board">
              <Button
                data-testid="compose-draft"
                variant="primary"
                size="sm"
                onClick={handleDraft}
                disabled={!canDraft}
                title={agentTitle}
              >
                {drafting ? 'Drafting...' : 'Draft Post'}
              </Button>
            </MobileDaemonGate>
            <span className="relative" title={agentTitle ?? (totalCredits === 0 ? 'You need credits to attach a bounty' : undefined)}>
              <Button
                data-testid="compose-bounty"
                variant="secondary"
                size="sm"
                onClick={() => setShowBounty(!showBounty)}
                disabled={!agentConnected || isBusy || (!showBounty && totalCredits === 0)}
              >
                {showBounty ? 'Remove Bounty' : 'Attach Bounty'}
              </Button>
            </span>
          </div>
        </>
      )}

      {stage === 'preview' && (
        <div className="animate-fade-in-up" data-testid="draft-preview">
          <div className="bg-bg-tertiary border border-accent-green/20 rounded-lg p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-bg-primary border-2 border-accent-green/30 flex items-center justify-center">
                <Icon name="cpu" size="sm" className="text-accent-green" />
              </div>
              <span className="text-sm font-semibold text-text-primary">{agentName}</span>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-accent-green/15 text-accent-green uppercase tracking-wide">
                AI Draft
              </span>
              <span
                className="px-2 py-0.5 text-[11px] font-bold rounded bg-bg-primary border border-border-default text-text-secondary uppercase tracking-wide"
                data-testid="preview-category"
              >
                {categoryInfo(category).label}
              </span>
            </div>
            <div className="text-sm text-text-secondary leading-relaxed prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{draftText}</ReactMarkdown>
            </div>
          </div>

          {!previewValidation.valid && (
            <p className="text-xs text-accent-red mb-2" data-testid="preview-validation-error">
              {previewValidation.message}
            </p>
          )}
          <AgentRequiredNotice className="mb-2" data-testid="preview-agent-required" />

          <div className="flex flex-wrap gap-2">
            <Button data-testid="preview-edit" variant="secondary" size="sm" onClick={() => setStage('edit')} disabled={isBusy}>
              Edit
            </Button>
            <Button data-testid="preview-original" variant="ghost" size="sm" onClick={() => setStage('compose')} disabled={isBusy}>
              Change Prompt
            </Button>
            <Button
              data-testid="preview-approve"
              variant="primary"
              size="sm"
              icon="check"
              onClick={handleApprove}
              disabled={!canApprove}
              title={agentTitle}
            >
              {isBusy ? 'Posting...' : 'Approve'}
            </Button>
            <Button data-testid="preview-cancel" variant="danger" size="sm" onClick={handleCancel} disabled={isBusy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {stage === 'edit' && (
        <div className="animate-fade-in-up" data-testid="draft-edit">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Post as</span>
            <span
              className="px-2 py-0.5 text-[11px] font-bold rounded bg-bg-primary border border-border-default text-text-secondary uppercase tracking-wide"
              data-testid="edit-category"
            >
              {categoryInfo(category).label}
            </span>
          </div>
          <MentionTextarea
            data-testid="edit-textarea"
            className="min-h-[120px] p-3 bg-bg-tertiary border border-border-default rounded text-sm text-text-primary font-mono resize-y outline-none focus:border-accent-green/50 mb-3"
            value={draftText}
            onChange={setDraftText}
            disabled={isBusy}
          />
          {!previewValidation.valid && (
            <p className="text-xs text-accent-red mb-2" data-testid="edit-validation-error">
              {previewValidation.message}
            </p>
          )}
          <AgentRequiredNotice className="mb-2" data-testid="edit-agent-required" />
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="edit-approve"
              variant="primary"
              size="sm"
              icon="check"
              onClick={handleApprove}
              disabled={!canApprove}
              title={agentTitle}
            >
              {isBusy ? 'Posting...' : 'Approve'}
            </Button>
            <Button data-testid="edit-back" variant="ghost" size="sm" onClick={() => setStage('preview')} disabled={isBusy}>
              Back to Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
