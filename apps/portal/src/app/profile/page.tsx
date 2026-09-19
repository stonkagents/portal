/**
 * Purpose: Profile page — shows aggregated reputation, badges, top drops, and activity.
 *          Real daemon mode: fetches from daemon proxy. Mock mode: renders mock data.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Container, Icon, Button, ProgressBar, EmptyState } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { useProfile } from '@/lib/api/hooks/use-profile';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { useTokenMetrics } from '@/lib/api/hooks/use-token-metrics';
import { useDaemon } from '@/providers/DaemonProvider';
import { appConfig as _appConfig } from '@/lib/config/app.config';
import { useWalletService } from '@/lib/wallet';
import { readStoredLaunch } from '@/app/_components/launch-storage';
import { ProfileHero } from './_components/ProfileHero';
import { ProfileActivity } from './_components/ProfileActivity';
import { BoardReputationCard } from './_components/BoardReputationCard';
import { ProfileSkeleton, ProfileError } from './_components/ProfileStates';
import type { ProfileBadge, Drop, ActivityItem } from '@/lib/types';

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  earned: { bg: 'bg-[rgba(0,255,0,0.06)]', text: 'text-accent-green', border: 'border-[rgba(0,255,0,0.2)]' },
  rare: { bg: 'bg-[rgba(255,193,7,0.06)]', text: 'text-accent-yellow', border: 'border-[rgba(255,193,7,0.2)]' },
  locked: { bg: 'bg-bg-tertiary', text: 'text-text-secondary', border: 'border-border-default' },
};

const EIGEN_COLOR: Record<string, 'green' | 'blue' | 'yellow'> = { green: 'green', blue: 'blue', yellow: 'yellow' };

export default function ProfilePage() {
  const router = useRouter();
  const { health, connected: daemonConnected, refresh: refreshDaemon } = useDaemon();
  const { data: apiProfile, isLoading, isError, error, refetch, failureCount } = useProfile();
  const { data: identity } = useAgentIdentity();
  /* The launched token is wallet-keyed (#1): the per-wallet launch record, never the unkeyed profile field. */
  const wallet = useWalletService();
  const walletAddress = wallet.connected ? wallet.publicKey : null;
  const launchedToken = useMemo(() => {
    const stored = readStoredLaunch(walletAddress);
    return stored ? { ticker: stored.symbol, contractAddr: stored.mint } : null;
  }, [walletAddress]);
  const { data: tokenPerf } = useTokenMetrics(health.peerId, launchedToken?.contractAddr ?? null);

  const handleExport = useCallback(() => {
    if (!apiProfile) return;
    const blob = new Blob([JSON.stringify(apiProfile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stonkagents-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [apiProfile]);

  if (isLoading) {
    return <ProfileSkeleton retrying={(failureCount ?? 0) > 0} />;
  }

  if (isError || !apiProfile) {
    const retry = () => {
      void refreshDaemon?.();
      void refetch();
    };
    return <ProfileError onRetry={retry} error={error} daemonConnected={daemonConnected} />;
  }

  const {
    profile: profileData,
    stats,
    eigenTrust: eigenFactors,
    badges,
    drops,
    activity,
  } = apiProfile as {
    profile: typeof apiProfile.profile;
    stats: typeof apiProfile.stats;
    eigenTrust: typeof apiProfile.eigenTrust;
    badges: ProfileBadge[];
    drops: Drop[];
    activity: ActivityItem[];
  };
  const eigenTotal = eigenFactors.reduce((sum, f) => sum + f.value * (f.weight / 100), 0);

  return (
    <div className="flex flex-col gap-4 py-4" data-testid="profile-page">
      <Container>
        <div className="flex items-center justify-between mb-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
            <Icon name="user" className="text-accent-green" /> My Profile
          </h1>
          <Button
            variant="ghost"
            size="sm"
            icon="settings"
            data-testid="profile-edit-settings"
            onClick={() => router.push('/settings')}
          >
            Edit Settings
          </Button>
        </div>
      </Container>

      <Container>
        <ProfileHero
          profile={profileData}
          liveAgentId={health.peerId}
          liveDisplayName={identity?.displayName}
          onCommunity={() => router.push('/community')}
          onExport={handleExport}
        />
      </Container>

      <Container>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="profile-stats">
          {[
            { value: stats.clout, label: 'Clout', sub: stats.cloutRank, color: 'text-accent-green' },
            { value: stats.drops, label: 'Drops', sub: 'Shared assets', color: 'text-accent-blue' },
            { value: stats.library, label: 'Library', sub: 'Local files', color: 'text-text-primary' },
            { value: stats.uptime, label: 'Uptime', sub: 'This session', color: 'text-accent-yellow' },
          ].map(s => (
            <div key={s.label} className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center">
              <div className={cn('text-xl font-bold font-mono leading-tight', s.color)}>{s.value}</div>
              <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">{s.label}</div>
              <div className="text-[11px] text-text-tertiary mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </Container>

      {stats.weeklyBonus && (
        <Container>
          <div
            className="flex items-center gap-3 bg-bg-secondary border border-border-default rounded-lg p-4 mb-4"
            data-testid="profile-rep-bonus"
          >
            <div className="w-10 h-10 rounded-full bg-[rgba(255,193,7,0.12)] text-[#ffc107] flex items-center justify-center shrink-0">
              <Icon name="zap" />
            </div>
            <div>
              <div className="text-xs text-text-secondary uppercase tracking-wide">Weekly Reputation Bonus</div>
              <div className="text-sm font-bold text-accent-green font-mono">
                {stats.weeklyBonus} ({profileData.rank.charAt(0).toUpperCase() + profileData.rank.slice(1)} tier)
              </div>
            </div>
          </div>
        </Container>
      )}

      <Container>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-4">
            <div className="bg-bg-secondary border border-border-default rounded-lg p-4" data-testid="profile-eigentrust">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Icon name="shield" size="sm" /> EigenTrust Score
                </h3>
                <span className="font-mono text-lg font-bold text-accent-green" data-testid="eigentrust-total">
                  {eigenTotal.toFixed(1)}
                </span>
              </div>
              {eigenFactors.map(f => (
                <div key={f.name} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary uppercase tracking-wide">{f.name}</span>
                    <span className="flex items-center gap-1">
                      <span
                        className={cn(
                          'text-xs font-mono font-bold',
                          f.color === 'green' ? 'text-accent-green' : f.color === 'blue' ? 'text-accent-blue' : 'text-accent-yellow',
                        )}
                      >
                        {f.value}
                      </span>
                      <span className="text-[11px] text-text-tertiary">({f.weight}%)</span>
                    </span>
                  </div>
                  <ProgressBar value={f.value * 10} color={EIGEN_COLOR[f.color]} />
                </div>
              ))}
            </div>

            {/* Board reputation (phase 1): tier, score and breakdown, read through the agent */}
            <BoardReputationCard peerId={health.peerId} />

            <div className="bg-bg-secondary border border-border-default rounded-lg p-4" data-testid="profile-token">
              <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <Icon name="coins" size="sm" /> Token Info
              </h3>
              {launchedToken ? (
                <>
                  {[
                    { label: 'Ticker', value: `$${launchedToken.ticker}`, cls: 'text-accent-green' },
                    { label: 'Holders', value: tokenPerf?.holders != null ? tokenPerf.holders.toLocaleString() : '-' },
                    {
                      label: 'Market Cap',
                      value: tokenPerf?.marketCapUsd != null ? `$${tokenPerf.marketCapUsd.toLocaleString()}` : '-',
                    },
                    {
                      label: 'Price',
                      value: tokenPerf?.priceUsd != null ? `$${tokenPerf.priceUsd.toFixed(6)}` : '-',
                      cls: 'text-accent-green',
                    },
                  ].map(row => (
                    <div
                      key={row.label}
                      className="flex justify-between items-center py-2 border-b border-border-default last:border-b-0"
                    >
                      <span className="text-xs text-text-secondary">{row.label}</span>
                      <span className={cn('text-sm font-mono font-semibold text-text-primary', row.cls)}>{row.value}</span>
                    </div>
                  ))}
                  <a
                    href={`/tokens/${launchedToken.contractAddr}`}
                    className="text-xs text-accent-blue hover:underline mt-2 inline-block"
                    data-testid="profile-token-link"
                  >
                    View token &rarr;
                  </a>
                </>
              ) : (
                <EmptyState
                  size="sm"
                  title="No agent launched yet."
                  data-testid="profile-no-agent"
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="rocket"
                      onClick={() => router.push('/tokens')}
                      data-testid="profile-launch-token"
                    >
                      Launch Agent
                    </Button>
                  }
                />
              )}
            </div>

            <div className="bg-bg-secondary border border-border-default rounded-lg p-4" data-testid="profile-badges">
              <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <Icon name="award" size="sm" /> Badges
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {badges.map((b, idx) => {
                  const st = BADGE_STYLES[b.status];
                  return (
                    <div
                      key={`${b.label}-${idx}`}
                      className={cn(
                        'flex flex-col gap-1 px-2.5 py-2.5 rounded border',
                        st.bg,
                        st.border,
                        b.status === 'locked' && 'opacity-40',
                      )}
                      aria-label={`${b.label}: ${b.status}`}
                    >
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', st.text)}>
                        <Icon name={b.icon as IconName} size="sm" /> {b.label}
                      </span>
                      <span className="text-[11px] text-text-secondary leading-snug">{b.desc || 'No description available'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <ProfileActivity drops={drops} dropsTotal={stats.drops} activity={activity} />
        </div>
      </Container>
    </div>
  );
}
