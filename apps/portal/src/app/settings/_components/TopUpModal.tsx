/**
 * Purpose: Top-up modal — one-click credit purchase signed by the connected wallet.
 *          State machine: idle → connecting → signing → confirming → success/error
 */
'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { Modal, Button, Icon } from '@/components/ui';
import { useWalletService } from '@/lib/wallet';
import { usePurchaseCredits } from '@/lib/api/hooks/use-purchase-credits';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';
import { CREDIT_TIERS, MIN_CUSTOM_CREDITS, calculateCustomSol } from '@/lib/credits/tiers';
import type { CreditTier } from '@/lib/types';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  connecting: 'Connecting...',
  signing: 'Confirm in your wallet...',
  confirming: 'Verifying...',
};

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const wallet = useWalletService();
  /* The purchase intent is created by the agent. The tab never opens this offline; if the
     agent drops while it is open, Buy is disabled with the notice instead of a network error. */
  const { connected: agentConnected, title: agentTitle } = useAgentRequired();
  const { status, error, result, purchase, reset } = usePurchaseCredits(wallet);
  const [selectedTier, setSelectedTier] = useState<CreditTier | null>(CREDIT_TIERS.find(t => t.id === 'pro') ?? null);
  const [customAmount, setCustomAmount] = useState('');
  const isProcessing = status === 'connecting' || status === 'signing' || status === 'confirming';
  const customCredits = Number(customAmount) || 0;
  const customSol = calculateCustomSol(customCredits);
  const customBelowMin = customCredits > 0 && customCredits < MIN_CUSTOM_CREDITS;
  const hasSelection = selectedTier !== null || customCredits >= MIN_CUSTOM_CREDITS;

  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => {
      reset();
      onClose();
    }, 1500);
    return () => clearTimeout(timer);
  }, [status, reset, onClose]);

  useEffect(() => {
    if (!open) return;
    reset();
    setSelectedTier(CREDIT_TIERS.find(t => t.id === 'pro') ?? null);
    setCustomAmount('');
  }, [open, reset]);

  function handleBuy() {
    if (selectedTier) purchase(selectedTier);
    else if (customCredits > 0) purchase(null, customCredits);
  }

  /* Disconnected: the shared connect prompt opens; the purchase continues once a wallet is in. */
  async function handleButtonClick() {
    if (!agentConnected) return;
    if (!wallet.connected && !(await wallet.connect())) return;
    handleBuy();
  }

  if (status === 'success' && result) {
    return (
      <Modal open={open} onClose={onClose} title="Top Up Credits" maxWidth="max-w-xl">
        <div className="flex flex-col items-center gap-4 py-8" data-testid="topup-modal">
          <div className="w-16 h-16 rounded-full bg-accent-green/20 flex items-center justify-center animate-pulse">
            <Icon name="check-circle" className="text-accent-green w-8 h-8" />
          </div>
          <p className="text-lg font-bold text-accent-green font-mono text-glow">
            {result.credits_granted.toLocaleString()} credits added!
          </p>
        </div>
      </Modal>
    );
  }

  if (status === 'error') {
    return (
      <Modal open={open} onClose={onClose} title="Top Up Credits" maxWidth="max-w-xl">
        <div className="flex flex-col items-center gap-4 py-6" data-testid="topup-modal">
          <div className="w-16 h-16 rounded-full bg-accent-red/20 flex items-center justify-center">
            <Icon name="alert-triangle" className="text-accent-red w-8 h-8" />
          </div>
          <p className="text-sm text-accent-red text-center">{error}</p>
          <div className="flex gap-3 w-full mt-2">
            <Button data-testid="topup-retry" variant="primary" className="flex-1" onClick={reset}>
              Try Again
            </Button>
            <Button data-testid="topup-cancel" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Top Up Credits" maxWidth="max-w-xl">
      <div className={cn('flex flex-col gap-4', isProcessing && 'opacity-60 pointer-events-none')} data-testid="topup-modal">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDIT_TIERS.map(tier => (
            <button
              key={tier.id}
              data-testid={`topup-tier-${tier.id}`}
              onClick={() => {
                setSelectedTier(tier);
                setCustomAmount('');
              }}
              className={cn(
                'relative flex flex-col items-center gap-2 p-4 rounded-lg border text-center cursor-pointer transition-all bg-bg-tertiary',
                selectedTier?.id === tier.id
                  ? 'border-accent-green shadow-[0_0_12px_rgba(0,255,0,0.2)]'
                  : 'border-border-default hover:border-border-hover',
              )}
            >
              {tier.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide bg-accent-green text-bg-void rounded-full">
                  Popular
                </span>
              )}
              {!!tier.discount && tier.discount > 0 && (
                <span className="absolute -top-2.5 right-2 px-1.5 py-0.5 text-[11px] font-bold bg-accent-blue text-white rounded-full">
                  -{tier.discount}%
                </span>
              )}
              <span className="text-lg font-bold font-mono text-text-primary">{tier.credits.toLocaleString()}</span>
              <span className="text-xs text-text-secondary">{tier.label}</span>
              <span className="text-sm font-semibold font-mono text-accent-green">{tier.solPrice} SOL</span>
              <span className="text-[11px] text-text-tertiary font-mono">
                {((tier.solPrice / tier.credits) * 1000).toFixed(2)} SOL / 1k
              </span>
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Custom Amount <span className="text-text-tertiary font-normal normal-case">(best rate, Ultra pricing)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              data-testid="topup-custom-amount"
              type="number"
              min={MIN_CUSTOM_CREDITS}
              placeholder={`${MIN_CUSTOM_CREDITS.toLocaleString()}+ credits...`}
              value={customAmount}
              onChange={e => {
                setCustomAmount(e.target.value);
                setSelectedTier(null);
              }}
              className={cn(
                'flex-1 min-h-[44px] px-3 py-2 bg-bg-tertiary border rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50',
                customBelowMin ? 'border-accent-red' : 'border-border-default',
              )}
            />
            <span className="text-xs text-text-secondary font-semibold">credits</span>
          </div>
          {customBelowMin && (
            <p className="mt-1 text-xs text-accent-red">
              Custom amounts must exceed {(MIN_CUSTOM_CREDITS - 1).toLocaleString()} credits
            </p>
          )}
          {customCredits >= MIN_CUSTOM_CREDITS && (
            <p className="mt-1 text-xs text-text-secondary font-mono">
              ≈ {customSol.toFixed(4)} SOL <span className="text-accent-blue">(-25% vs Starter)</span>
            </p>
          )}
        </div>
        <AgentRequiredNotice data-testid="topup-agent-required" />
        <div className="flex gap-3 mt-2">
          <Button
            data-testid="topup-buy"
            variant="primary"
            className="flex-1"
            icon={isProcessing ? undefined : 'wallet'}
            disabled={isProcessing || !hasSelection || !agentConnected}
            title={agentTitle}
            onClick={() => void handleButtonClick()}
          >
            {isProcessing ? STATUS_LABELS[status] : !wallet.connected ? 'Connect Wallet' : 'Buy Credits'}
          </Button>
          <Button data-testid="topup-cancel" variant="secondary" onClick={onClose} disabled={status === 'confirming'}>
            Cancel
          </Button>
        </div>
        {agentConnected && !wallet.connected && (
          <button
            data-testid="topup-connect-wallet"
            onClick={() => void wallet.connect()}
            className="text-xs text-accent-yellow text-center w-full hover:text-accent-green transition-colors cursor-pointer"
          >
            Connect your wallet to purchase credits.
          </button>
        )}
      </div>
    </Modal>
  );
}
