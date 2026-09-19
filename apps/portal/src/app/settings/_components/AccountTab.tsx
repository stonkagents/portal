/**
 * Purpose: Account tab: about (portal build, agent version, network), external links,
 *          notification preferences. Account deletion has no backend and is not shown.
 */
'use client';

import { SectionTitle, SettingsCard } from './shared';
import { aboutRows, ABOUT_LINKS } from './account-data';
import { NotificationPreferences } from '@/components/features/settings/NotificationPreferences';
import { useEvents } from '@/providers/EventProvider';
import { useDaemon } from '@/providers/DaemonProvider';
import { useUpdateStatus } from '@/lib/api/hooks/use-update-status';

export function AccountTab() {
  const { preferences, updatePreferences } = useEvents();
  /* The agent's version as the controller reports it: the same source as the footer, so the two never disagree. */
  const { connected } = useDaemon();
  const { data: updateStatus } = useUpdateStatus();
  const rows = aboutRows(connected ? (updateStatus?.currentVersion ?? '') : '');

  return (
    <div data-testid="settings-account">
      {/* About */}
      <SettingsCard>
        <SectionTitle>About</SectionTitle>
        {rows.map(r => (
          <div key={r.label} className="flex justify-between py-1.5 text-xs">
            <span className="text-text-secondary">{r.label}</span>
            <span className="text-text-primary font-mono" data-testid={r.testId}>
              {r.value}
            </span>
          </div>
        ))}
        <hr className="border-border-default my-3" />
        <div className="flex gap-2 flex-wrap">
          {ABOUT_LINKS.map(l => (
            <a
              key={l.testId}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-xs text-text-secondary border border-border-default rounded-lg hover:text-accent-green hover:border-accent-green/30 no-underline transition-colors"
              data-testid={l.testId}
            >
              {l.label}
            </a>
          ))}
        </div>
      </SettingsCard>

      {/* Notifications */}
      <SettingsCard className="mb-0">
        <SectionTitle>Notifications</SectionTitle>
        <NotificationPreferences prefs={preferences} onChange={updatePreferences} />
      </SettingsCard>
    </div>
  );
}
