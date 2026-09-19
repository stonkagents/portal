/**
 * Purpose: Credits & API tab: credit balance (with the free-credit expiry when the
 *          tracker reports one), wallet holdings, transaction log, API key.
 */
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, Button } from '@/components/ui';
import { SectionTitle, SettingsCard } from './shared';
import { TopUpModal } from './TopUpModal';
import { CreditTransactions } from './CreditTransactions';
import { ApiKeyCard } from './ApiKeyCard';
import { useCredits, useTransactions } from '@/lib/api/hooks/use-credits';
import { useWalletService } from '@/lib/wallet';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';

/** "Free credits expire on <date>", or null when the tracker set no expiry or sent an unreadable one. */
export function freeCreditsExpiryNote(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Free credits expire on ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
}

export function CreditsTab() {
  const [topUpOpen, setTopUpOpen] = useState(false);
  /* Balance and top-up go through the agent: offline, the numbers are "-" and the
     action is disabled with the notice, never a network error. */
  const { connected: agentConnected, title: agentTitle } = useAgentRequired();
  const { data: balance, isLoading: balanceLoading } = useCredits();
  const { data: transactions, isLoading: txLoading } = useTransactions();
  const balanceUnknown = !agentConnected || balanceLoading;
  const wallet = useWalletService();
  const { connected: walletConnected, fetchBalance } = wallet;

  // The wallet service only reads SOL on demand; refresh once per connection.
  useEffect(() => {
    if (walletConnected) void fetchBalance();
  }, [walletConnected, fetchBalance]);

  const creditStats = [
    { label: 'Free', value: balanceUnknown ? '-' : (balance?.free_balance ?? 0).toLocaleString(), color: 'text-accent-green' },
    { label: 'Paid', value: balanceUnknown ? '-' : (balance?.paid_balance ?? 0).toLocaleString(), color: 'text-accent-blue' },
    { label: 'Total', value: balanceUnknown ? '-' : (balance?.total ?? 0).toLocaleString(), color: 'text-accent-green' },
    {
      label: 'Purchased',
      value: balanceUnknown ? '-' : (balance?.lifetime_purchased ?? 0).toLocaleString(),
      color: 'text-accent-yellow',
    },
  ];
  const expiryNote = agentConnected && balance ? freeCreditsExpiryNote(balance.free_expires_at) : null;

  return (
    <div data-testid="settings-credits">
      {/* Credit Dashboard */}
      <SettingsCard>
        <SectionTitle>Credit Balance</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="credit-dashboard">
          {creditStats.map(item => (
            <div key={item.label} className="bg-bg-tertiary border border-border-default rounded-lg p-3 text-center">
              <div className={cn('text-lg font-bold font-mono', item.color)}>{item.value}</div>
              <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        {expiryNote && (
          <p className="text-xs text-text-tertiary mb-3" data-testid="credit-free-expiry">
            {expiryNote}
          </p>
        )}
        <Button
          variant="primary"
          size="sm"
          icon="plus"
          className="w-full"
          onClick={() => agentConnected && setTopUpOpen(true)}
          disabled={!agentConnected}
          title={agentTitle}
          data-testid="credit-topup"
        >
          Top Up Credits
        </Button>
        <AgentRequiredNotice className="mt-2 justify-center" data-testid="credit-topup-agent-required" />
      </SettingsCard>

      {/* Wallet Holdings: only what the connected wallet actually reports; no placeholder tokens */}
      <SettingsCard>
        <SectionTitle>Wallet Holdings</SectionTitle>
        <div data-testid="token-portfolio">
          {walletConnected ? (
            <>
              <div className="flex items-center justify-between p-3 bg-bg-tertiary border border-border-default rounded-lg mb-3">
                <div className="min-w-0">
                  <span className="block text-xs text-text-secondary uppercase tracking-wide">SOL Balance</span>
                  <span className="block text-xs text-text-tertiary font-mono truncate" data-testid="portfolio-wallet">
                    {wallet.shortAddress}
                  </span>
                </div>
                <span className="text-lg font-bold font-mono text-accent-green" data-testid="portfolio-total">
                  {wallet.balance === null ? '-' : `${wallet.balance.toFixed(4)} SOL`}
                </span>
              </div>
              <p className="text-xs text-text-tertiary">
                Agent token balances show on each agent page.{' '}
                <a href="/tokens" className="text-accent-blue no-underline hover:underline" data-testid="portfolio-link-tokens">
                  Browse Agents
                </a>
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-4 text-center" data-testid="portfolio-empty">
              <Icon name="wallet" size="lg" className="text-text-tertiary" />
              <p className="text-sm text-text-secondary">Connect a wallet to see your holdings.</p>
              <Button variant="secondary" size="sm" onClick={() => void wallet.connect()} data-testid="portfolio-connect">
                {wallet.connecting ? 'Connecting...' : 'Connect wallet'}
              </Button>
            </div>
          )}
        </div>
      </SettingsCard>

      <CreditTransactions transactions={transactions} isLoading={txLoading} agentConnected={agentConnected} />

      <ApiKeyCard />

      {/* The modal never opens without the agent, even if the connection drops with the flag set. */}
      <TopUpModal open={topUpOpen && agentConnected} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
