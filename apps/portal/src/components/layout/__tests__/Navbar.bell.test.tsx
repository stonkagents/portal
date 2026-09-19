/**
 * Purpose: the alerts bell exists once in the navbar, in the status group from 900px and next
 *          to the wallet button below it, so a phone can reach alerts and no test id or live
 *          region is ever duplicated. Everything the navbar reads is stubbed.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const wide = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/hooks/use-media-query', () => ({ useMediaQuery: () => wide.value }));

vi.mock('next/navigation', () => ({ usePathname: () => '/gallery', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/providers/I18nProvider', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/providers/EventProvider', () => ({ useEvents: () => ({ events: [], markAllRead: vi.fn() }) }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => ({ connected: false, connecting: false, shortAddress: null, connect: vi.fn() }) }));
vi.mock('@/lib/api/hooks/use-existing-agent', () => ({ useExistingAgent: () => null }));
vi.mock('@/lib/api/hooks/use-board-activity', () => ({
  useBoardActivity: () => ({ data: undefined }),
  useMarkActivityRead: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/lib/api/hooks/use-autopilot', () => ({ useAutopilotEventList: () => ({ data: undefined }) }));
vi.mock('../notifications/use-digest-rows', () => ({
  useDigestRows: () => ({ rows: [], unread: 0, markRead: vi.fn(), markAllRead: vi.fn() }),
}));
vi.mock('@/components/features/wallet', () => ({ useConnectPrompt: () => ({ ensureConnected: vi.fn() }) }));
vi.mock('../CommandToolsChip', () => ({ CommandToolsChip: () => null }));
vi.mock('../CreditBalance', () => ({ CreditBalance: () => null }));
vi.mock('../AvatarDropdown', () => ({ AvatarDropdown: () => null }));
vi.mock('../KillSwitch', () => ({ KillSwitch: () => null, KillBanner: () => null }));
vi.mock('../DaemonDot', () => ({ DaemonDot: () => null }));
vi.mock('@/components/brand', () => ({ ClawLogo: () => null }));
vi.mock('@/components/features/onboarding/AgentEnvMismatchNotice', () => ({ AgentEnvMismatchBadge: () => null }));

import { Navbar } from '../Navbar';

describe('Navbar alerts bell', () => {
  beforeEach(() => {
    wide.value = true;
  });

  it('renders one bell in the status group on a wide viewport', () => {
    render(<Navbar connected daemonStatus="online" />);
    const bells = screen.getAllByTestId('notification-bell');
    expect(bells).toHaveLength(1);
    expect(bells[0].closest('div.lg\\:hidden')).toBeNull();
  });

  it('renders one bell next to the wallet button below 900px', () => {
    wide.value = false;
    render(<Navbar connected daemonStatus="online" />);
    const bells = screen.getAllByTestId('notification-bell');
    expect(bells).toHaveLength(1);
    expect(bells[0].closest('div.lg\\:hidden')).not.toBeNull();
    expect(screen.getByTestId('nav-mobile-connect')).toBeInTheDocument();
  });

  it('renders no bell while the agent is offline', () => {
    wide.value = false;
    render(<Navbar connected={false} daemonStatus="offline" />);
    expect(screen.queryByTestId('notification-bell')).toBeNull();
  });
});
