/**
 * Purpose: Tests for HeroLaunchpad — Step 1, connect a wallet then launch.
 */
import { render as rtlRender, screen, fireEvent, waitFor, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '@/providers/I18nProvider';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnect = vi.fn();
let mockWallet: Record<string, unknown> = {
  connected: false,
  connecting: false,
  publicKey: null,
  shortAddress: null,
  error: null,
  connect: mockConnect,
};

vi.mock('@/lib/wallet', () => ({
  useWalletService: () => mockWallet,
}));

vi.mock('@/components/ui', () => ({
  Icon: () => <span />,
}));

vi.mock('@/components/brand/ClawMascot', () => ({
  ClawMascot: () => <div data-testid="mascot" />,
}));

import { HeroLaunchpad } from '../HeroLaunchpad';

beforeEach(() => {
  vi.clearAllMocks();
  mockWallet = {
    connected: false,
    connecting: false,
    publicKey: null,
    shortAddress: null,
    error: null,
    connect: mockConnect,
  };
});

/** The component reads its copy through i18n; render inside the provider so the English strings resolve. */
const render = (ui: ReactElement, options?: RenderOptions) => rtlRender(ui, { wrapper: I18nProvider, ...options });

describe('HeroLaunchpad', () => {
  it('leads with the launch headline and the two-step promise', () => {
    render(<HeroLaunchpad onLaunch={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Launch your StonkAgent');
    expect(screen.getByText(/Tokenize against \$STONK/)).toBeInTheDocument();
    expect(screen.getByText('Run your agent')).toBeInTheDocument();
    expect(screen.getByTestId('step-bullet-1')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('step-bullet-2')).toHaveAttribute('data-state', 'next');
  });

  it('offers wallet connect while disconnected', () => {
    render(<HeroLaunchpad onLaunch={vi.fn()} />);
    fireEvent.click(screen.getByTestId('launchpad-connect-wallet'));
    expect(mockConnect).toHaveBeenCalled();
  });

  it('keeps Launch tappable while disconnected: it opens the connect prompt first, then the form', async () => {
    const onLaunch = vi.fn();
    mockConnect.mockResolvedValueOnce(true);
    render(<HeroLaunchpad onLaunch={onLaunch} />);
    const launch = screen.getByTestId('launchpad-open-form');
    expect(launch).toBeEnabled();
    expect(launch).toHaveTextContent('Launch Agent');
    fireEvent.click(launch);
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    await waitFor(() => expect(onLaunch).toHaveBeenCalled());
  });

  it('does not open the form when the connect prompt is dismissed', async () => {
    const onLaunch = vi.fn();
    mockConnect.mockResolvedValueOnce(false);
    render(<HeroLaunchpad onLaunch={onLaunch} />);
    fireEvent.click(screen.getByTestId('launchpad-open-form'));
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it('links to the agent this wallet already launched instead of Launch (#21)', () => {
    mockWallet = { ...mockWallet, connected: true, publicKey: 'Wa11et', shortAddress: 'Wa11et…1234' };
    render(
      <HeroLaunchpad onLaunch={vi.fn()} existingAgent={{ mint: 'M1nt', name: 'Agent One', symbol: 'ONE', href: '/tokens/M1nt' }} />,
    );
    expect(screen.queryByTestId('launchpad-open-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('launchpad-view-agent')).toHaveAttribute('href', '/tokens/M1nt');
    expect(screen.getByTestId('launchpad-view-agent')).toHaveTextContent('View your agent');
  });

  it('states the $STONK alignment and links to How it works in both wallet states', () => {
    const { unmount } = render(<HeroLaunchpad onLaunch={vi.fn()} />);
    expect(screen.getByTestId('launchpad-wallet-hint')).toHaveTextContent('All holder rewards in $STONK. 100% alignment.');
    const link = screen.getByTestId('launchpad-how-it-works');
    expect(link).toHaveAttribute('href', 'https://docs.stonkagents.com/#how-it-works');
    expect(link).toHaveAttribute('target', '_blank');
    unmount();

    mockWallet = { ...mockWallet, connected: true, publicKey: 'Wa11et', shortAddress: 'Wa11et…1234' };
    render(<HeroLaunchpad onLaunch={vi.fn()} />);
    expect(screen.getByTestId('launchpad-wallet-hint')).toHaveTextContent('All holder rewards in $STONK. 100% alignment.');
    expect(screen.queryByText(/Connect a wallet to launch/)).not.toBeInTheDocument();
  });

  it('shows the connected wallet and opens the launch form without a second prompt', async () => {
    mockWallet = { ...mockWallet, connected: true, publicKey: 'Wa11et', shortAddress: 'Wa11et…1234' };
    const onLaunch = vi.fn();
    render(<HeroLaunchpad onLaunch={onLaunch} />);

    expect(screen.getByTestId('launchpad-wallet-connected')).toHaveTextContent('Wa11et…1234');
    fireEvent.click(screen.getByTestId('launchpad-open-form'));
    await waitFor(() => expect(onLaunch).toHaveBeenCalled());
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('surfaces a wallet error', () => {
    mockWallet = { ...mockWallet, error: 'User rejected the request' };
    render(<HeroLaunchpad onLaunch={vi.fn()} />);
    expect(screen.getByTestId('launchpad-wallet-error')).toHaveTextContent('User rejected the request');
  });
});
