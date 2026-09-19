/**
 * Purpose: Profile hero card — avatar, name, rank, online badge, Agent ID, actions
 */

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { truncateAgentId } from '@/lib/utils/format';
import { cleanDisplayName } from '@/lib/agent-name';
import { Icon, Button, Badge } from '@/components/ui';
import type { Profile } from '@/lib/types';

const RANK_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  gold: { bg: 'bg-[rgba(255,193,7,0.15)]', text: 'text-[#ffc107]', border: 'border-[rgba(255,193,7,0.3)]', label: 'Gold' },
  silver: { bg: 'bg-[rgba(192,192,192,0.15)]', text: 'text-[#c0c0c0]', border: 'border-[rgba(192,192,192,0.3)]', label: 'Silver' },
  bronze: { bg: 'bg-[rgba(205,127,50,0.15)]', text: 'text-[#cd7f32]', border: 'border-[rgba(205,127,50,0.3)]', label: 'Bronze' },
  og: { bg: 'bg-accent-green/12', text: 'text-accent-green', border: 'border-accent-green/30', label: 'OG' },
  new: { bg: 'bg-[rgba(120,120,120,0.15)]', text: 'text-text-secondary', border: 'border-[rgba(120,120,120,0.3)]', label: 'New' },
};

interface ProfileHeroProps {
  profile: Profile;
  /** Live Agent ID from daemon/tracker; when set, overrides profile.agentId */
  liveAgentId?: string | null;
  /**
   * The display name as the daemon has it right now (Settings > Identity).
   * Undefined while unknown, so the tracker's copy on the profile stands in;
   * an empty string means the owner cleared it and the masked id shows.
   */
  liveDisplayName?: string | null;
  /** Called when "Community" is clicked: the board has no author filter, so it opens the board itself. */
  onCommunity?: () => void;
  /** Called when "Export" is clicked */
  onExport?: () => void;
}

export function ProfileHero({ profile, liveAgentId, liveDisplayName, onCommunity, onExport }: ProfileHeroProps) {
  const [copied, setCopied] = useState(false);
  const rank = RANK_STYLES[profile.rank] ?? RANK_STYLES.new;
  const agentId = liveAgentId && liveAgentId.trim() ? liveAgentId.trim() : profile.agentId;
  const displayId = truncateAgentId(agentId);
  /* The daemon's name wins once known; the masked id is always one line below it. */
  const displayName = liveDisplayName !== undefined ? cleanDisplayName(liveDisplayName) : cleanDisplayName(profile.displayName);
  const name = displayName ?? profile.name;

  const handleCopy = useCallback(() => {
    if (!agentId) return;
    navigator.clipboard.writeText(agentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agentId]);

  return (
    <div className="relative bg-bg-secondary border border-border-default rounded-lg p-6" data-testid="profile-hero">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent-red rounded-t-lg shadow-[0_0_10px_rgba(255,68,68,0.3)]" />
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative w-[72px] h-[72px] rounded-full bg-accent-red/12 border-2 border-accent-red flex items-center justify-center text-accent-red font-mono font-bold text-lg shrink-0">
          {name.slice(0, 2).toUpperCase()}
          {profile.isOnline && (
            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-accent-green border-2 border-bg-secondary rounded-full shadow-[0_0_6px_var(--color-accent-green)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-lg font-bold text-text-primary" data-testid="profile-name">
              {name}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide border',
                rank.bg,
                rank.text,
                rank.border,
              )}
            >
              <Icon name="award" size="sm" /> {rank.label}
            </span>
            {profile.isOnline && (
              <Badge variant="online" dot>
                Online
              </Badge>
            )}
          </div>
          {/* The id and its copy button stay together; on a narrow card the pair wraps under the label as one unit. */}
          <div className="text-xs text-text-secondary font-mono flex items-center gap-x-2 flex-wrap">
            Agent ID:
            <span className="inline-flex items-center gap-1">
              <code className="text-text-primary bg-white/6 px-1 py-0.5 rounded">{displayId}</code>
              <button
                onClick={handleCopy}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-transparent border-none text-text-secondary cursor-pointer rounded hover:text-accent-green transition-colors"
                aria-label="Copy Agent ID"
                data-testid="profile-copy-id"
              >
                <Icon name={copied ? 'check' : 'copy'} size="sm" />
              </button>
            </span>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button variant="primary" size="sm" icon="message-square" data-testid="profile-community" onClick={onCommunity}>
              Community
            </Button>
            <Button variant="ghost" size="sm" icon="download" data-testid="profile-export" onClick={onExport}>
              Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
