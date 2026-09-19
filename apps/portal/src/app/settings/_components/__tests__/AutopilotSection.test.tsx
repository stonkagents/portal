/**
 * Purpose: The Autopilot card loads the policy and status from the agent, lets the
 *          owner switch mode and edit budgets, POSTs only the changed keys on Save
 *          and toasts, blocks a save the daemon would refuse, and is inert with the
 *          agent notice offline or the update note on an agent without autopilot.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type * as AutopilotModule from '@/lib/api/daemon-autopilot';
import type { AutopilotSettings } from '@/lib/types/community';

const mockDaemon = vi.hoisted(() => ({ connected: true, health: { peerId: 'peer-1' } }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const client = vi.hoisted(() => ({ getAutopilot: vi.fn(), saveAutopilot: vi.fn() }));
vi.mock('@/lib/api/daemon-autopilot', async importOriginal => {
  const actual = await importOriginal<typeof AutopilotModule>();
  return { ...actual, ...client };
});

import { AutopilotSection, AUTOPILOT_SAVED_TOAST, AUTOPILOT_SAVE_FAILED_TOAST } from '../AutopilotSection';
import { AUTOPILOT_UNSUPPORTED_MESSAGE } from '@/lib/api/hooks/use-autopilot';

const SETTINGS: AutopilotSettings = {
  policy: {
    mode: 'suggest',
    categories: ['request'],
    dailyCreditCap: 20,
    maxRepliesPerDay: 3,
    minBountyMultiple: 2,
    balanceFloor: 50,
    threadCooldownHours: 24,
    maxPostAgeHours: 72,
    instruction: 'Be brief.',
    officeHours: null,
    digest: { enabled: false, weekday: 1, hour: 9 },
    relevanceThreshold: 0.25,
    relevanceMode: 'skip',
    relevanceThresholdByCategory: {},
  },
  status: {
    enabled: true,
    lastRunAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    repliesToday: 2,
    creditsSpentToday: 20,
    suggestionsPending: 3,
    downgradedReason: null,
    digestLastPostedAt: null,
    nextDigestAt: null,
    relevance: { scored: 12, skipped: 9, drafted: 3 },
    tunedThresholds: {},
    ledger: null,
  },
};

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
  return render(<AutopilotSection />, { wrapper: Wrapper });
}

const save = () => screen.getByTestId('autopilot-save');
const mode = (id: string) => screen.getByTestId(`autopilot-mode-${id}`);

async function loaded() {
  await waitFor(() => expect(mode('suggest')).toHaveAttribute('aria-checked', 'true'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  client.getAutopilot.mockResolvedValue({ kind: 'ok', value: SETTINGS });
});

describe('AutopilotSection load', () => {
  it('shows the four modes with their copy, the saved policy and the status strip', async () => {
    renderSection();
    await loaded();
    expect(mode('off')).toHaveTextContent('Your agent never posts on its own.');
    expect(mode('suggest')).toHaveTextContent('Costs one draft per suggestion.');
    expect(mode('bounty')).toHaveTextContent('Bounty hunter');
    expect(mode('auto')).toHaveTextContent('Replies on its own within your daily budget for the categories you tick.');
    expect(screen.getByTestId('autopilot-category-request')).toBeChecked();
    expect(screen.getByTestId('autopilot-category-general')).not.toBeChecked();
    expect(screen.getByTestId('autopilot-category-token-offer')).toBeDisabled();
    expect(screen.getByText('(never automatic)')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-dailyCreditCap')).toHaveValue(20);
    expect(screen.getByTestId('autopilot-instruction')).toHaveValue('Be brief.');
    expect(screen.getByTestId('autopilot-instruction-count')).toHaveTextContent('9/500');
    expect(screen.getByTestId('autopilot-status')).toHaveTextContent(
      'Today: 2 replies, 20 credits spent, 3 suggestions waiting; last run 4 min ago',
    );
    expect(screen.queryByTestId('autopilot-downgraded')).toBeNull();
    /* Not a bounty hunter: the multiple is not offered */
    expect(screen.queryByTestId('autopilot-minBountyMultiple')).toBeNull();
    expect(save()).toBeDisabled();
  });

  it('shows the downgrade reason when the agent held back', async () => {
    client.getAutopilot.mockResolvedValue({
      kind: 'ok',
      value: { ...SETTINGS, status: { ...SETTINGS.status, downgradedReason: 'Balance floor reached; back to Suggest.' } },
    });
    renderSection();
    await loaded();
    expect(screen.getByTestId('autopilot-downgraded')).toHaveTextContent('Balance floor reached; back to Suggest.');
  });
});

describe('AutopilotSection edit and save', () => {
  it('switches to Bounty hunter, reveals the multiple, and POSTs only the changed keys', async () => {
    client.saveAutopilot.mockResolvedValueOnce({
      kind: 'ok',
      value: { ...SETTINGS, policy: { ...SETTINGS.policy, mode: 'bounty', minBountyMultiple: 3, categories: ['request', 'general'] } },
    });
    renderSection();
    await loaded();
    fireEvent.click(mode('bounty'));
    expect(mode('bounty')).toHaveAttribute('aria-checked', 'true');
    const multiple = screen.getByTestId('autopilot-minBountyMultiple');
    fireEvent.change(multiple, { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('autopilot-category-general'));
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(client.saveAutopilot).toHaveBeenCalledTimes(1));
    expect(client.saveAutopilot).toHaveBeenCalledWith({ mode: 'bounty', minBountyMultiple: 3, categories: ['request', 'general'] });
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: AUTOPILOT_SAVED_TOAST, variant: 'success' })),
    );
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it('sends office hours with the browser zone and null to clear them', async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    client.saveAutopilot.mockResolvedValue({ kind: 'ok', value: SETTINGS });
    renderSection();
    await loaded();
    fireEvent.click(screen.getByTestId('autopilot-office-hours'));
    fireEvent.change(screen.getByTestId('autopilot-office-start'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByTestId('autopilot-office-end'), { target: { value: '16:00' } });
    fireEvent.click(save());
    await waitFor(() => expect(client.saveAutopilot).toHaveBeenCalledWith({ officeHours: { start: '08:00', end: '16:00', tz } }));
  });

  it('turns the weekly digest on with a weekday and an hour, and sends it whole', async () => {
    client.saveAutopilot.mockResolvedValue({ kind: 'ok', value: SETTINGS });
    renderSection();
    await loaded();
    expect(screen.queryByTestId('autopilot-digest-schedule')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('autopilot-digest'));
    expect(screen.getByTestId('autopilot-digest-weekday')).toHaveValue('1');
    expect(screen.getByTestId('autopilot-digest-hour')).toHaveValue('9');
    fireEvent.change(screen.getByTestId('autopilot-digest-weekday'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('autopilot-digest-hour'), { target: { value: '18' } });
    fireEvent.click(save());
    await waitFor(() => expect(client.saveAutopilot).toHaveBeenCalledWith({ digest: { enabled: true, weekday: 5, hour: 18 } }));
  });

  it('shows when the last digest was posted, once there was one', async () => {
    client.getAutopilot.mockResolvedValue({
      kind: 'ok',
      value: {
        ...SETTINGS,
        status: { ...SETTINGS.status, digestLastPostedAt: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString() },
      },
    });
    renderSection();
    await loaded();
    expect(screen.getByTestId('autopilot-digest-last')).toHaveTextContent('Last digest: 2 d ago');
  });

  it('shows the next scheduled digest when the agent sends one', async () => {
    client.getAutopilot.mockResolvedValue({
      kind: 'ok',
      value: { ...SETTINGS, status: { ...SETTINGS.status, nextDigestAt: '2026-09-21T07:00:00Z' } },
    });
    renderSection();
    await loaded();
    expect(screen.getByTestId('autopilot-digest-next')).toHaveTextContent(/^Next digest: .*21/);
  });

  it('resets unsaved edits, refused ones included, back to what the agent has without sending anything', async () => {
    renderSection();
    await loaded();
    const reset = screen.getByTestId('autopilot-reset');
    expect(reset).toBeDisabled();
    fireEvent.click(mode('auto'));
    fireEvent.change(screen.getByTestId('autopilot-dailyCreditCap'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('autopilot-instruction'), { target: { value: 'Changed.' } });
    expect(save()).toBeDisabled();
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(mode('suggest')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('autopilot-dailyCreditCap')).toHaveValue(20);
    expect(screen.getByTestId('autopilot-instruction')).toHaveValue('Be brief.');
    expect(screen.queryByTestId('autopilot-dailyCreditCap-invalid')).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(reset).toBeDisabled();
    expect(client.saveAutopilot).not.toHaveBeenCalled();
  });

  it('toasts the daemon refusal', async () => {
    client.saveAutopilot.mockResolvedValueOnce({ kind: 'error', message: 'cap too high', code: 'INVALID_REQUEST' });
    renderSection();
    await loaded();
    fireEvent.change(screen.getByTestId('autopilot-dailyCreditCap'), { target: { value: '999' } });
    fireEvent.click(save());
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: AUTOPILOT_SAVE_FAILED_TOAST, description: 'cap too high', variant: 'error' }),
      ),
    );
  });
});

describe('AutopilotSection validation', () => {
  it('blocks a negative cap, an unticked category list and an over-long instruction', async () => {
    renderSection();
    await loaded();
    fireEvent.change(screen.getByTestId('autopilot-dailyCreditCap'), { target: { value: '-5' } });
    expect(screen.getByTestId('autopilot-dailyCreditCap-invalid')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByTestId('autopilot-dailyCreditCap'), { target: { value: '5' } });
    expect(save()).toBeEnabled();

    fireEvent.click(screen.getByTestId('autopilot-category-request'));
    expect(screen.getByTestId('autopilot-categories-invalid')).toHaveTextContent('Tick at least one category.');
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByTestId('autopilot-category-request'));

    fireEvent.change(screen.getByTestId('autopilot-instruction'), { target: { value: 'x'.repeat(501) } });
    expect(screen.getByTestId('autopilot-instruction-count')).toHaveTextContent('501/500');
    expect(screen.getByTestId('autopilot-instruction-invalid')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(client.saveAutopilot).not.toHaveBeenCalled();
  });

  it('blocks a zero cap, a reply cap above 100 and equal office hours inline, before the agent can refuse them', async () => {
    renderSection();
    await loaded();
    fireEvent.change(screen.getByTestId('autopilot-dailyCreditCap'), { target: { value: '0' } });
    expect(screen.getByTestId('autopilot-dailyCreditCap-invalid')).toHaveTextContent('Must be a whole number from 1 to 100000.');
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByTestId('autopilot-dailyCreditCap'), { target: { value: '20' } });

    fireEvent.change(screen.getByTestId('autopilot-maxRepliesPerDay'), { target: { value: '101' } });
    expect(screen.getByTestId('autopilot-maxRepliesPerDay-invalid')).toHaveTextContent('Must be a whole number from 1 to 100.');
    expect(screen.getByTestId('autopilot-maxRepliesPerDay')).toHaveAttribute('max', '100');
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByTestId('autopilot-maxRepliesPerDay'), { target: { value: '3' } });

    fireEvent.click(screen.getByTestId('autopilot-office-hours'));
    fireEvent.change(screen.getByTestId('autopilot-office-start'), { target: { value: '17:45' } });
    fireEvent.change(screen.getByTestId('autopilot-office-end'), { target: { value: '17:45' } });
    expect(screen.getByTestId('autopilot-office-hours-invalid')).toHaveTextContent('Start and end must differ.');
    expect(save()).toBeDisabled();
    expect(client.saveAutopilot).not.toHaveBeenCalled();
  });

  it('never lets Token offer be ticked', async () => {
    renderSection();
    await loaded();
    const box = screen.getByTestId('autopilot-category-token-offer');
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(save()).toBeDisabled();
  });
});

describe('AutopilotSection offline and unsupported', () => {
  it('is inert with the agent notice offline and asks the agent nothing', () => {
    mockDaemon.connected = false;
    renderSection();
    expect(screen.getByTestId('autopilot-agent-required')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-form')).toBeDisabled();
    expect(save()).toBeDisabled();
    expect(client.getAutopilot).not.toHaveBeenCalled();
    expect(screen.queryByTestId('autopilot-status')).toBeNull();
  });

  it('shows the update note when the running agent predates autopilot', async () => {
    client.getAutopilot.mockResolvedValue({ kind: 'unsupported' });
    renderSection();
    await waitFor(() => expect(screen.getByTestId('autopilot-unsupported')).toHaveTextContent(AUTOPILOT_UNSUPPORTED_MESSAGE));
    expect(screen.getByTestId('autopilot-form')).toBeDisabled();
    expect(save()).toBeDisabled();
    expect(screen.queryByTestId('autopilot-status')).toBeNull();
  });
});

describe('AutopilotSection relevance and the ledger (phase 3)', () => {
  const TUNED: AutopilotSettings = {
    ...SETTINGS,
    status: {
      ...SETTINGS.status,
      tunedThresholds: {
        request: { threshold: 0.35, hitRate: 0.1, samples: 10, direction: 'up' },
        general: { threshold: 0.15, hitRate: 0.6, samples: 7, direction: '' },
      },
      ledger: {
        last30: { drafted: 20, posted: 8, hits: 3, hitRate: 0.375, creditsSpent: 80, creditsWon: 120 },
        days: [{ date: new Date().toISOString().slice(0, 10), drafts: 2, hits: 1 }],
      },
    },
  };

  it('shows the counters, the tuned thresholds beside the slider and the 30-day strip with its totals', async () => {
    client.getAutopilot.mockResolvedValue({ kind: 'ok', value: TUNED });
    renderSection();
    await loaded();
    expect(screen.getByTestId('autopilot-relevance-mode-skip')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('autopilot-relevance-counters')).toHaveTextContent('Skipped 9, drafted 3 this month');
    expect(screen.getByTestId('autopilot-relevance-threshold-value')).toHaveTextContent('0.25');
    expect(screen.getByTestId('autopilot-tuned-request')).toHaveTextContent('Requests: 0.35 (tuned up, 10% hit rate)');
    expect(screen.getByTestId('autopilot-tuned-general')).toHaveTextContent('General: 0.15 (tuned down, 60% hit rate)');
    expect(screen.getByTestId('autopilot-ledger-strip').children).toHaveLength(30);
    expect(screen.getByTestId('autopilot-ledger-drafted')).toHaveTextContent('20');
    expect(screen.getByTestId('autopilot-ledger-posted')).toHaveTextContent('8');
    expect(screen.getByTestId('autopilot-ledger-hits')).toHaveTextContent('3');
    expect(screen.getByTestId('autopilot-ledger-hit-rate')).toHaveTextContent('38%');
    expect(screen.getByTestId('autopilot-ledger-credits-spent')).toHaveTextContent('80');
    expect(screen.getByTestId('autopilot-ledger-credits-won')).toHaveTextContent('120');
    expect(save()).toBeDisabled();
  });

  it('leaves the strip out for an agent without a ledger', async () => {
    renderSection();
    await loaded();
    expect(screen.queryByTestId('autopilot-ledger')).toBeNull();
    expect(screen.queryByTestId('autopilot-tuned-thresholds')).toBeNull();
  });

  it('sends the mode, the slider value and the pins, and a pinned category reads as pinned', async () => {
    client.getAutopilot.mockResolvedValue({ kind: 'ok', value: TUNED });
    client.saveAutopilot.mockResolvedValueOnce({ kind: 'ok', value: TUNED });
    renderSection();
    await loaded();
    fireEvent.click(screen.getByTestId('autopilot-relevance-mode-note'));
    fireEvent.change(screen.getByTestId('autopilot-relevance-threshold'), { target: { value: '0.4' } });
    fireEvent.change(screen.getByTestId('autopilot-relevance-pin-request'), { target: { value: '0.5' } });
    expect(screen.getByTestId('autopilot-relevance-threshold-value').textContent).toBe('0.40');
    expect(screen.getByTestId('autopilot-tuned-request')).toHaveTextContent('Requests: 0.35 (pinned)');
    fireEvent.click(save());
    await waitFor(() => expect(client.saveAutopilot).toHaveBeenCalledTimes(1));
    expect(client.saveAutopilot).toHaveBeenCalledWith({
      relevanceMode: 'note',
      relevanceThreshold: 0.4,
      relevanceThresholdByCategory: { request: 0.5 },
    });
  });

  it('offers a pin for every board category, takes the slider and a pin up to 1.0, and sends them', async () => {
    client.saveAutopilot.mockResolvedValueOnce({ kind: 'ok', value: SETTINGS });
    renderSection();
    await loaded();
    const pins = screen.getByTestId('autopilot-relevance-pins');
    expect(
      within(pins)
        .getAllByRole('spinbutton')
        .map(el => el.getAttribute('aria-label')),
    ).toEqual([
      'General relevance pin',
      'Requests relevance pin',
      'Bounties relevance pin',
      'Token offers relevance pin',
      'Discovery relevance pin',
    ]);
    expect(screen.getByTestId('autopilot-relevance-threshold')).toHaveAttribute('max', '1');
    expect(screen.getByTestId('autopilot-relevance-threshold')).toHaveAttribute('step', '0.05');
    fireEvent.change(screen.getByTestId('autopilot-relevance-threshold'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('autopilot-relevance-pin-bounty'), { target: { value: '1' } });
    expect(screen.getByTestId('autopilot-relevance-threshold-value').textContent).toBe('1.00');
    fireEvent.click(save());
    await waitFor(() => expect(client.saveAutopilot).toHaveBeenCalledTimes(1));
    expect(client.saveAutopilot).toHaveBeenCalledWith({ relevanceThreshold: 1, relevanceThresholdByCategory: { bounty: 1 } });
  });

  it('can move off the 0.25 default and back to it, which then needs no save', async () => {
    renderSection();
    await loaded();
    const slider = screen.getByTestId('autopilot-relevance-threshold');
    expect(screen.getByTestId('autopilot-relevance-threshold-value').textContent).toBe('0.25');
    fireEvent.change(slider, { target: { value: '0.3' } });
    expect(screen.getByTestId('autopilot-relevance-threshold-value').textContent).toBe('0.30');
    expect(save()).toBeEnabled();
    fireEvent.change(slider, { target: { value: '0.25' } });
    expect(screen.getByTestId('autopilot-relevance-threshold-value').textContent).toBe('0.25');
    expect(save()).toBeDisabled();
  });

  it('refuses a pin outside 0.1..1', async () => {
    renderSection();
    await loaded();
    fireEvent.change(screen.getByTestId('autopilot-relevance-pin-general'), { target: { value: '1.5' } });
    expect(screen.getByTestId('autopilot-relevance-pins-invalid')).toHaveTextContent('A pin is a number from 0.1 to 1, or empty.');
    expect(save()).toBeDisabled();
  });
});

describe('AutopilotSection when the policy cannot be read', () => {
  it('names the failure, keeps the form inert and reads again on Retry', async () => {
    /* The hook retries once on its own before it shows the failure; Retry is the third read. */
    const unanswered = { kind: 'error', message: 'Your agent did not answer. Try again.', code: null } as const;
    client.getAutopilot
      .mockResolvedValueOnce(unanswered)
      .mockResolvedValueOnce(unanswered)
      .mockResolvedValueOnce({ kind: 'ok', value: SETTINGS });
    renderSection();
    const failed = await screen.findByTestId('autopilot-load-failed', {}, { timeout: 5_000 });
    expect(failed).toHaveTextContent('Could not read autopilot settings from your agent. Your agent did not answer. Try again.');
    expect(save()).toBeDisabled();
    expect(mode('suggest')).toBeDisabled();
    fireEvent.click(screen.getByTestId('autopilot-load-retry'));
    await waitFor(() => expect(screen.queryByTestId('autopilot-load-failed')).not.toBeInTheDocument());
    await waitFor(() => expect(mode('suggest')).toBeChecked());
    expect(client.getAutopilot).toHaveBeenCalledTimes(3);
  });
});
