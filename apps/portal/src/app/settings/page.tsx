/**
 * Purpose: Settings page shell: tab navigation with lazy-rendered tab panels. Every control saves itself; there is no page-level Save.
 */
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils/cn';
import { Container, Icon, TabSkeleton, AgentOfflineNotice } from '@/components/ui';
// Direct import — NOT from barrel './_components'. Barrel pulls all siblings, defeating dynamic code splitting.
import { IdentityTab } from './_components/IdentityTab';
import { useDaemon } from '@/providers/DaemonProvider';
import { SetUpAgentLink } from '@/components/features/onboarding/AgentRequiredNotice';
import { LocalAccessNotice } from '@/components/features/install/LocalAccessNotice';

const CreditsTab = dynamic(() => import('./_components/CreditsTab').then(m => m.CreditsTab), { loading: () => <TabSkeleton /> });
const AutonomyTab = dynamic(() => import('./_components/AutonomyTab').then(m => m.AutonomyTab), { loading: () => <TabSkeleton /> });
const FoldersTab = dynamic(() => import('./_components/FoldersTab').then(m => m.FoldersTab), { loading: () => <TabSkeleton /> });
const SecurityTab = dynamic(() => import('./_components/SecurityTab').then(m => m.SecurityTab), { loading: () => <TabSkeleton /> });
const AccountTab = dynamic(() => import('./_components/AccountTab').then(m => m.AccountTab), { loading: () => <TabSkeleton /> });
const PacksTab = dynamic(() => import('./_components/PacksTab').then(m => m.PacksTab), { loading: () => <TabSkeleton /> });

const TABS = [
  { id: 'identity', label: 'Identity', icon: 'user' as const },
  { id: 'credits', label: 'Credits & API', icon: 'coins' as const },
  { id: 'autonomy', label: 'Autonomy', icon: 'shield' as const },
  { id: 'packs', label: 'Packs', icon: 'package' as const },
  { id: 'folders', label: 'Folders & Sync', icon: 'hard-drive' as const },
  { id: 'security', label: 'Security', icon: 'lock' as const },
  { id: 'account', label: 'Account', icon: 'settings' as const },
];

const TAB_PANELS: Record<string, React.ComponentType> = {
  identity: IdentityTab,
  credits: CreditsTab,
  autonomy: AutonomyTab,
  packs: PacksTab,
  folders: FoldersTab,
  security: SecurityTab,
  account: AccountTab,
};

const VALID_TAB_IDS = new Set(TABS.map(t => t.id));

function getTabFromHash(): string {
  if (typeof window === 'undefined') return 'identity';
  const hash = window.location.hash.replace('#', '');
  return VALID_TAB_IDS.has(hash) ? hash : 'identity';
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const Panel = TAB_PANELS[activeTab];
  const { connected } = useDaemon();

  // Sync hash → tab on popstate (browser back/forward)
  useEffect(() => {
    const onHash = () => setActiveTab(getTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="flex flex-col gap-4 py-4" data-testid="settings-page">
      <Container>
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-sm text-text-secondary mt-1">Configure your Agent node, security, and preferences</p>
        </div>
      </Container>

      {/* Tab Bar */}
      <Container>
        <div className="relative mb-4">
          <div className="flex gap-0 border-b border-border-default overflow-x-auto scrollbar-none" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  window.location.hash = tab.id;
                }}
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-2 text-xs font-mono font-semibold border-b-2 border-transparent cursor-pointer whitespace-nowrap min-h-[44px] bg-transparent border-t-0 border-l-0 border-r-0 transition-all',
                  activeTab === tab.id
                    ? 'text-accent-green border-b-accent-green'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/3',
                )}
                data-testid={`settings-tab-${tab.id}`}
              >
                <Icon name={tab.icon} size="sm" /> {tab.label}
              </button>
            ))}
          </div>
          {/* Scroll fade indicator — visible only on mobile when tabs overflow */}
          <div
            className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-bg-primary to-transparent pointer-events-none md:hidden"
            aria-hidden="true"
          />
        </div>
      </Container>

      {/* Active Panel: one offline notice for every tab: settings live on the agent, so nothing here can be saved without it */}
      <Container>
        <LocalAccessNotice priority={1} className="mb-4" />
        {!connected && (
          <AgentOfflineNotice
            state="offline"
            detail="Settings live on your agent and are available once it is installed and live."
            action={<SetUpAgentLink className="text-xs" />}
            className="mb-4"
          />
        )}
        {Panel && <Panel />}
      </Container>
    </div>
  );
}
