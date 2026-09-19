/**
 * Purpose: AccountTab: About rows carry real values (portal build, the agent version the
 *          controller reports, the configured network), the NotificationPreferences
 *          integration via EventProvider, and no account-delete card (no backend).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdatePreferences = vi.fn();

vi.mock('@/providers/EventProvider', () => ({
  useEvents: () => ({
    events: [],
    alertCount: 0,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    dismiss: vi.fn(),
    addEvent: vi.fn(),
    preferences: {
      preset: 'balanced',
      overrides: {
        sync: 'nudge',
        peer: 'nudge',
        reputation: 'nudge',
        credit: 'nudge',
        security: 'alert',
        system: 'digest',
        agent: 'digest',
      },
    },
    updatePreferences: mockUpdatePreferences,
  }),
}));

const mockDaemon = vi.hoisted(() => ({ connected: true, health: { peerId: 'peer-1' } }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const mockUpdate = vi.hoisted(() => ({ data: { currentVersion: '2.2.2' } as { currentVersion: string } | undefined }));
vi.mock('@/lib/api/hooks/use-update-status', () => ({ useUpdateStatus: () => mockUpdate }));

vi.mock('@/lib/version', () => ({ APP_VERSION: '2026.9.15', BUILD_ID: 'abc1234' }));

import { AccountTab } from '../_components/AccountTab';
import { NETWORK_LABEL } from '../_components/account-data';
import { config } from '@/config';

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  mockUpdate.data = { currentVersion: '2.2.2' };
});

describe('AccountTab about', () => {
  it('shows the portal version and build, the agent version and the configured network', () => {
    render(<AccountTab />);
    expect(screen.getByTestId('about-portal-version')).toHaveTextContent('v2026.9.15');
    expect(screen.getByTestId('about-portal-build')).toHaveTextContent('abc1234');
    expect(screen.getByTestId('about-agent-version')).toHaveTextContent('v2.2.2');
    expect(screen.getByTestId('about-network')).toHaveTextContent(NETWORK_LABEL);
    expect(NETWORK_LABEL).toBe(config.cluster === 'mainnet' ? 'Solana mainnet' : 'Solana devnet');
  });

  it('shows "-" for the agent version while the agent is offline', () => {
    mockDaemon.connected = false;
    render(<AccountTab />);
    expect(screen.getByTestId('about-agent-version')).toHaveTextContent('-');
  });

  it('has no literals without a source and no delete-account card', () => {
    render(<AccountTab />);
    expect(screen.queryByText('Genesis')).toBeNull();
    expect(screen.queryByText(/libp2p \+ CIDv1/)).toBeNull();
    expect(screen.queryByText(/^SDK$/)).toBeNull();
    expect(screen.queryByTestId('danger-zone')).toBeNull();
    expect(screen.queryByTestId('account-delete-start')).toBeNull();
  });
});

describe('AccountTab NotificationPreferences integration', () => {
  it('renders the NotificationPreferences component', () => {
    render(<AccountTab />);
    expect(screen.getByTestId('notification-prefs')).toBeInTheDocument();
  });

  it('shows the current preset from EventProvider', () => {
    render(<AccountTab />);
    const select = screen.getByTestId('prefs-preset') as HTMLSelectElement;
    expect(select.value).toBe('balanced');
  });

  it('calls updatePreferences when preset changes', () => {
    render(<AccountTab />);
    const select = screen.getByTestId('prefs-preset');
    fireEvent.change(select, { target: { value: 'minimal' } });
    expect(mockUpdatePreferences).toHaveBeenCalledWith(expect.objectContaining({ preset: 'minimal' }));
  });
});
