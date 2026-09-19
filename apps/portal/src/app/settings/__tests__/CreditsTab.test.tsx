/**
 * Purpose: Settings > Credits with and without the agent. Offline: balances are "-",
 *          Top Up is disabled with the agent-required notice, the top-up modal never
 *          opens, the API key is not asked for. Online: real balances, the free-credit
 *          expiry when the tracker sends one, the CSV export built from the ledger,
 *          and the API key read from the agent, masked, copied only after a confirm.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type * as SetupModule from '@/lib/api/daemon-setup';
import type { TransactionResponse } from '@/lib/api/daemon-credits';

const mockDaemon = vi.hoisted(() => ({ connected: true, health: { peerId: 'peer-1' } }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

type Balance = { free_balance: number; paid_balance: number; total: number; lifetime_purchased: number; free_expires_at?: string };
const mockCredits = vi.hoisted(() => ({
  balance: { data: undefined as Balance | undefined, isLoading: false },
  transactions: { data: undefined as unknown[] | undefined, isLoading: false },
}));
vi.mock('@/lib/api/hooks/use-credits', () => ({
  useCredits: () => mockCredits.balance,
  useTransactions: () => mockCredits.transactions,
}));

const mockWallet = vi.hoisted(() => ({
  installed: true,
  connected: false,
  publicKey: null,
  shortAddress: null,
  balance: null,
  connecting: false,
  error: null,
  connect: vi.fn(async () => false),
  disconnect: vi.fn(async () => {}),
  fetchBalance: vi.fn(async () => {}),
  sign: vi.fn(),
  signAndSend: vi.fn(),
}));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => mockWallet }));

const mockPurchase = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/hooks/use-purchase-credits', () => ({
  usePurchaseCredits: () => ({ status: 'idle', error: null, result: null, purchase: mockPurchase, reset: vi.fn() }),
}));

const setupClient = vi.hoisted(() => ({ getInstallerPeerKey: vi.fn() }));
vi.mock('@/lib/api/daemon-setup', async importOriginal => {
  const actual = await importOriginal<typeof SetupModule>();
  return { ...actual, ...setupClient };
});

import { CreditsTab, freeCreditsExpiryNote } from '../_components/CreditsTab';
import { API_KEY_COPY_CONFIRM, API_KEY_MISSING } from '../_components/ApiKeyCard';
import { transactionsCsv, TRANSACTIONS_CSV_FILENAME } from '../_components/CreditTransactions';

const API_KEY = 'sk_live_0123456789abcdefghij';

const TXS: TransactionResponse[] = [
  { id: 't1', amount: 50, balance_type: 'free', reason: 'Welcome grant', created_at: '2026-09-01T10:00:00Z' },
  { id: 't2', amount: -3, balance_type: 'free', reason: 'Chat, "detailed" mode', created_at: '2026-09-02T11:30:00Z' },
];

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
  return render(<CreditsTab />, { wrapper: Wrapper });
}

function topUpDialog(): HTMLDialogElement {
  const dialog = screen.getAllByTestId('topup-modal')[0].closest('dialog');
  if (!dialog) throw new Error('top-up dialog missing');
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupClient.getInstallerPeerKey.mockResolvedValue({
    kind: 'ok',
    key: { apiKey: API_KEY, trackerUrl: 'https://tracker.example.test' },
  });
});

describe('Settings > Credits with the agent offline', () => {
  beforeEach(() => {
    mockDaemon.connected = false;
    mockCredits.balance.data = undefined;
    mockCredits.balance.isLoading = false;
    mockCredits.transactions.data = undefined;
  });

  it('disables Top Up Credits and shows the agent-required notice next to it', () => {
    renderTab();
    const topUp = screen.getByTestId('credit-topup');
    expect(topUp).toBeDisabled();
    expect(topUp).toHaveAttribute('title', 'Available once your agent is installed and live.');
    const notice = screen.getByTestId('credit-topup-agent-required');
    expect(notice).toHaveTextContent('Available once your agent is installed and live.');
    expect(notice.querySelector('a')).toHaveAttribute('href', '/#onboard');
  });

  it('never opens the top-up modal', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('credit-topup'));
    expect(topUpDialog()).not.toHaveAttribute('open');
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  it('shows "-" for every balance instead of zeros', () => {
    renderTab();
    const dashboard = screen.getByTestId('credit-dashboard');
    const values = Array.from(dashboard.querySelectorAll('.font-mono')).map(el => el.textContent);
    expect(values).toEqual(['-', '-', '-', '-']);
  });

  it('shows the notice in the transaction log and keeps the CSV export disabled', () => {
    renderTab();
    expect(screen.getByTestId('transaction-log-agent-required')).toBeInTheDocument();
    expect(screen.queryByText('No transactions yet.')).toBeNull();
    expect(screen.getByTestId('tx-export')).toBeDisabled();
  });

  it('does not ask the agent for the API key and keeps Copy disabled', () => {
    renderTab();
    expect(setupClient.getInstallerPeerKey).not.toHaveBeenCalled();
    expect(screen.getByTestId('api-key-masked')).toHaveTextContent('-');
    expect(screen.getByTestId('api-key-copy')).toBeDisabled();
    expect(screen.getByTestId('api-key-agent-required')).toBeInTheDocument();
  });

  it('shows no generic network error anywhere', () => {
    renderTab();
    expect(screen.queryByText(/network error/i)).toBeNull();
  });
});

describe('Settings > Credits with the agent connected', () => {
  beforeEach(() => {
    mockDaemon.connected = true;
    mockCredits.balance.data = { free_balance: 120, paid_balance: 30, total: 150, lifetime_purchased: 30 };
    mockCredits.balance.isLoading = false;
    mockCredits.transactions.data = [];
  });

  it('keeps Top Up enabled, hides the notice, and opens the modal on click', () => {
    renderTab();
    const topUp = screen.getByTestId('credit-topup');
    expect(topUp).toBeEnabled();
    expect(topUp).not.toHaveAttribute('title');
    expect(screen.queryByTestId('credit-topup-agent-required')).toBeNull();
    expect(screen.queryByTestId('transaction-log-agent-required')).toBeNull();

    fireEvent.click(topUp);
    expect(topUpDialog()).toHaveAttribute('open');
    expect(screen.getByTestId('topup-buy')).toBeEnabled();
  });

  it('renders real balances and has no invented survival cap or agent-to-agent send', () => {
    renderTab();
    const values = Array.from(screen.getByTestId('credit-dashboard').querySelectorAll('.font-mono')).map(el => el.textContent);
    expect(values).toEqual(['120', '30', '150', '30']);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('survival-display')).toBeNull();
    expect(screen.queryByText(/550/)).toBeNull();
    expect(screen.queryByTestId('open-transfer')).toBeNull();
    expect(screen.queryByText(/Full key/)).toBeNull();
    expect(screen.queryByTestId('credit-free-expiry')).toBeNull();
  });

  it('shows when the free credits expire only when the tracker says so', () => {
    mockCredits.balance.data = { ...mockCredits.balance.data!, free_expires_at: '2026-10-01T00:00:00Z' };
    renderTab();
    expect(screen.getByTestId('credit-free-expiry')).toHaveTextContent(/^Free credits expire on /);
    expect(freeCreditsExpiryNote(undefined)).toBeNull();
    expect(freeCreditsExpiryNote('not a date')).toBeNull();
    expect(freeCreditsExpiryNote('2026-10-01T12:00:00Z')).toMatch(/^Free credits expire on .*2026$/);
  });

  it('builds the CSV from the ledger and hands the browser a text/csv blob', () => {
    mockCredits.transactions.data = TXS;
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:csv');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderTab();
    const exportBtn = screen.getByTestId('tx-export');
    expect(exportBtn).toBeEnabled();
    fireEvent.click(exportBtn);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0].type).toBe('text/csv;charset=utf-8');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    expect(TRANSACTIONS_CSV_FILENAME).toMatch(/\.csv$/);

    const csv = transactionsCsv(TXS);
    expect(csv).toBe(
      'id,created_at,reason,balance_type,amount\r\n' +
        't1,2026-09-01T10:00:00Z,Welcome grant,free,50\r\n' +
        't2,2026-09-02T11:30:00Z,"Chat, ""detailed"" mode",free,-3\r\n',
    );
  });

  it('keeps the CSV export disabled with an empty ledger', () => {
    renderTab();
    expect(screen.getByTestId('tx-export')).toBeDisabled();
  });

  it('reads the API key from the agent, shows it masked, and copies the real key only after a confirm', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderTab();

    await waitFor(() => expect(screen.getByTestId('api-key-masked')).toHaveTextContent('sk_l••••••••ghij'));
    expect(screen.getByTestId('api-key-masked')).not.toHaveTextContent('0123456789');
    expect(screen.queryByTestId('api-key-missing')).toBeNull();

    fireEvent.click(screen.getByTestId('api-key-copy'));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByTestId('api-key-confirm')).toHaveTextContent(API_KEY_COPY_CONFIRM);

    fireEvent.click(screen.getByTestId('api-key-confirm-cancel'));
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('api-key-copy'));
    fireEvent.click(screen.getByTestId('api-key-confirm-copy'));
    expect(writeText).toHaveBeenCalledWith(API_KEY);
  });

  it('says so when the agent has not registered with the tracker yet', async () => {
    setupClient.getInstallerPeerKey.mockResolvedValue({ kind: 'not-registered' });
    renderTab();
    await waitFor(() => expect(screen.getByTestId('api-key-missing')).toHaveTextContent(API_KEY_MISSING));
    expect(screen.getByTestId('api-key-copy')).toBeDisabled();
  });
});
