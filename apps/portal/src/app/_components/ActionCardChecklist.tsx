/**
 * Purpose: Onboarding checklist for ActionCard — the two-step product
 *          (connect wallet, launch token, run your agent), then Connect X.
 *          Every item is backed by a real signal; nothing here is permanently undone.
 *          The launch reward is granted when the agent binds the token, not here.
 */
'use client';

import { useSocialConnections } from '@/lib/api/hooks/use-social-connections';
import type { HomePageState } from './useHomePage';

interface ChecklistItem {
  id: string;
  /* i18n: keys requested as home.checklist.<id> (Track FE-1 owns src/lib/i18n). */
  label: string;
  reward?: string;
  isDone: (ctx: ChecklistContext) => boolean;
}

interface ChecklistContext {
  walletConnected: boolean;
  hasToken: boolean;
  agentLive: boolean;
  connectedSocials: Set<string>;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'wallet', label: 'Connect your wallet', isDone: ctx => ctx.walletConnected },
  { id: 'token', label: 'Launch your token', isDone: ctx => ctx.hasToken },
  { id: 'agent', label: 'Run your agent', reward: '+credits', isDone: ctx => ctx.agentLive },
  { id: 'twitter', label: 'Connect X', reward: '+50', isDone: ctx => ctx.connectedSocials.has('twitter') },
];

interface ActionCardChecklistProps {
  launchedToken: HomePageState['launchedToken'];
  walletConnected?: boolean;
  agentLive?: boolean;
}

export function ActionCardChecklist({ launchedToken, walletConnected = false, agentLive = false }: ActionCardChecklistProps) {
  const { data: socialData } = useSocialConnections();

  const connectedSocials = new Set(socialData?.connections?.map(c => c.platform) ?? []);

  const ctx: ChecklistContext = {
    walletConnected,
    hasToken: !!launchedToken,
    agentLive,
    connectedSocials,
  };

  const doneCount = CHECKLIST_ITEMS.filter(item => item.isDone(ctx)).length;
  let foundNext = false;

  return (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] text-text-tertiary uppercase tracking-[0.08em]">Next steps</div>
        <span className="text-[11px] text-accent-green font-semibold" data-testid="checklist-progress">
          {doneCount}/{CHECKLIST_ITEMS.length}
        </span>
      </div>

      <div className="flex flex-col gap-0.5" data-testid="checklist">
        {CHECKLIST_ITEMS.map(item => {
          const done = item.isDone(ctx);
          const isNext = !done && !foundNext;
          if (isNext) foundNext = true;

          return (
            <div
              key={item.id}
              data-testid={`check-item-${item.id}`}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-[11px] transition-colors cursor-pointer border ${
                done
                  ? 'done opacity-50 border-transparent'
                  : isNext
                    ? 'next bg-accent-green/4 border-accent-green/15 shadow-[0_0_6px_rgba(0,255,0,0.08)]'
                    : 'border-transparent hover:bg-white/[0.03] hover:border-border-default'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center text-[11px] shrink-0 ${
                  done
                    ? 'border-accent-green bg-accent-green/10 text-accent-green'
                    : isNext
                      ? 'border-accent-green/40'
                      : 'border-border-default'
                }`}
              >
                {done ? '✔' : ''}
              </span>
              <span
                className={`flex-1 ${
                  done ? 'line-through text-text-tertiary' : isNext ? 'text-accent-green font-semibold' : 'text-text-primary'
                }`}
              >
                {item.label}
              </span>
              {item.reward && !done && (
                <span className="text-[11px] text-accent-green font-semibold whitespace-nowrap">{item.reward}</span>
              )}
              {isNext && <span className="text-[11px] text-text-tertiary">&rsaquo;</span>}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-white/[0.06] rounded-full overflow-hidden mt-3" data-testid="checklist-progress-bar">
        <div
          className="h-full bg-accent-green rounded-full transition-[width] duration-300 shadow-[0_0_6px_rgba(0,255,0,0.3)]"
          style={{ width: `${(doneCount / CHECKLIST_ITEMS.length) * 100}%` }}
        />
      </div>
    </>
  );
}
