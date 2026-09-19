/**
 * Purpose: Tests for the roadmap interest dialog (RI-1) — our copy, multi-select
 *          chips, the posted body, the counts tally on success, the
 *          never-fake-success guard, and the module-level open request.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
const wallet = vi.hoisted(() => ({ connected: true, publicKey: 'Wa11et1111111111111111111111111111111111111' }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => wallet }));
const postInterest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/interest', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/interest')>();
  return { ...actual, postInterest };
});

import { InterestDialog, INTEREST_TITLE, INTEREST_LOGGED, tallyLine } from '../InterestDialog';
import { InterestDialogHost } from '../InterestDialogHost';
import { openInterest, closeInterest, getInterestRequest, resetInterestRequest } from '../interest-request';

const EMAIL = ['bob', 'example.com'].join('@');

/* jsdom has no HTMLDialogElement.show/close */
beforeAll(() => {
  HTMLDialogElement.prototype.show = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  resetInterestRequest();
  wallet.connected = true;
  wallet.publicKey = 'Wa11et1111111111111111111111111111111111111';
});

function pickBasics() {
  fireEvent.click(screen.getByTestId('interest-cap-trade'));
  fireEvent.click(screen.getByTestId('interest-priority-pay'));
}

describe('InterestDialog', () => {
  it('opens on our title with every capability chip, a priority group, the route and the wallet', () => {
    render(<InterestDialog open onClose={vi.fn()} />);
    expect(screen.getByText(INTEREST_TITLE)).toHaveTextContent('What should your agent be able to do?');
    const chips = screen.getAllByRole('checkbox');
    expect(chips).toHaveLength(8);
    expect(screen.getByTestId('interest-cap-trade')).toHaveTextContent('Trade for me');
    expect(screen.getByTestId('interest-cap-trade')).toHaveTextContent('sniper / copy');
    expect(screen.getByTestId('interest-cap-other')).toHaveTextContent('Something else');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('interest-priority-pay')).toHaveTextContent('I’d pay for it');
    expect(screen.getByTestId('interest-path')).toHaveTextContent('from /');
    expect(screen.getByTestId('interest-wallet')).toHaveTextContent('wallet Wa11…1111');
    expect(screen.getByTestId('interest-counter')).toHaveTextContent('0/600');
    expect(screen.getByTestId('interest-send')).toBeDisabled();
  });

  it('multi-selects chips and only enables the send once a capability and a priority are picked', () => {
    render(<InterestDialog open onClose={vi.fn()} />);
    const trade = screen.getByTestId('interest-cap-trade');
    const alerts = screen.getByTestId('interest-cap-alerts');
    fireEvent.click(trade);
    fireEvent.click(alerts);
    expect(trade).toHaveAttribute('aria-checked', 'true');
    expect(alerts).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('interest-send')).toBeDisabled();
    fireEvent.click(screen.getByTestId('interest-priority-important'));
    expect(screen.getByTestId('interest-priority-important')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('interest-send')).toBeEnabled();
    fireEvent.click(trade);
    expect(trade).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(alerts);
    expect(screen.getByTestId('interest-send')).toBeDisabled();
  });

  it('requires a line when "Something else" is picked, and counts the description', () => {
    render(<InterestDialog open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('interest-cap-other'));
    fireEvent.click(screen.getByTestId('interest-priority-nice'));
    expect(screen.getByTestId('interest-describe-hint')).toBeInTheDocument();
    expect(screen.getByTestId('interest-send')).toBeDisabled();
    fireEvent.change(screen.getByTestId('interest-description'), { target: { value: 'Book my flights' } });
    expect(screen.queryByTestId('interest-describe-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('interest-counter')).toHaveTextContent('15/600');
    expect(screen.getByTestId('interest-send')).toBeEnabled();
    expect(screen.getByTestId('interest-description')).toHaveAttribute('maxlength', '600');
  });

  it('walks the priority radios with arrow keys', () => {
    render(<InterestDialog open onClose={vi.fn()} />);
    const nice = screen.getByTestId('interest-priority-nice');
    fireEvent.keyDown(nice, { key: 'ArrowRight' });
    expect(screen.getByTestId('interest-priority-important')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByTestId('interest-priority-important'), { key: 'ArrowLeft' });
    expect(nice).toHaveAttribute('aria-checked', 'true');
  });

  it('posts capabilities, description, priority, contact, the wallet and the route, then shows the tally', async () => {
    postInterest.mockResolvedValueOnce({ counts: { trade: 12, alerts: 1 } });
    render(<InterestDialog open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('interest-cap-trade'));
    fireEvent.click(screen.getByTestId('interest-cap-alerts'));
    fireEvent.click(screen.getByTestId('interest-priority-pay'));
    fireEvent.change(screen.getByTestId('interest-description'), { target: { value: '  Snipe launches and ping me  ' } });
    fireEvent.change(screen.getByTestId('interest-contact'), { target: { value: EMAIL } });
    fireEvent.click(screen.getByTestId('interest-send'));
    await waitFor(() => expect(screen.getByTestId('interest-sent')).toHaveTextContent(INTEREST_LOGGED));
    expect(postInterest).toHaveBeenCalledWith(
      {
        capabilities: ['trade', 'alerts'],
        description: 'Snipe launches and ping me',
        priority: 'pay',
        contact: EMAIL,
        contactVia: 'email',
        walletAddress: 'Wa11et1111111111111111111111111111111111111',
        path: '/',
      },
      /* no Turnstile site key in tests: no widget, no token, and the send is never blocked */
      null,
    );
    expect(screen.getByTestId('interest-tally-trade')).toHaveTextContent('12 agents want this');
    expect(screen.getByTestId('interest-tally-alerts')).toHaveTextContent('1 agent wants this');
    expect(screen.queryByTestId('interest-tally-token')).not.toBeInTheDocument();
  });

  it('renders no Turnstile widget without a site key', () => {
    render(<InterestDialog open onClose={vi.fn()} />);
    expect(screen.queryByTestId('turnstile-box')).not.toBeInTheDocument();
  });

  it('shows the success line without a tally when the tracker sent no counts', async () => {
    postInterest.mockResolvedValueOnce({ counts: undefined });
    wallet.connected = false;
    const onClose = vi.fn();
    render(<InterestDialog open onClose={onClose} prefill={{ path: '/gallery' }} />);
    pickBasics();
    fireEvent.click(screen.getByTestId('interest-send'));
    await waitFor(() => expect(screen.getByTestId('interest-sent')).toBeInTheDocument());
    expect(screen.queryByTestId('interest-tally')).not.toBeInTheDocument();
    expect(postInterest.mock.calls[0][0]).toMatchObject({ path: '/gallery' });
    expect(postInterest.mock.calls[0][0]).not.toHaveProperty('walletAddress', wallet.publicKey);
    fireEvent.click(screen.getByTestId('interest-done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('never fakes success: a failed post keeps the picks and shows the error', async () => {
    postInterest.mockRejectedValueOnce(new Error('The send never reached the Network.'));
    render(<InterestDialog open onClose={vi.fn()} />);
    pickBasics();
    fireEvent.change(screen.getByTestId('interest-description'), { target: { value: 'Snipe' } });
    fireEvent.click(screen.getByTestId('interest-send'));
    await waitFor(() => expect(screen.getByTestId('interest-error')).toHaveTextContent('The send never reached the Network.'));
    expect(screen.queryByTestId('interest-sent')).not.toBeInTheDocument();
    expect(screen.getByTestId('interest-cap-trade')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('interest-priority-pay')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('interest-description')).toHaveValue('Snipe');
    expect(screen.getByTestId('interest-send')).toBeEnabled();
  });

  it('asks which platform a bare handle is on, and sends it as contactVia', async () => {
    postInterest.mockResolvedValueOnce({});
    render(<InterestDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('interest-contact'), { target: { value: '@bob' } });
    expect(screen.getByTestId('interest-contact-hint')).toHaveTextContent('Which platform is that handle on?');
    fireEvent.click(screen.getByTestId('interest-platform-discord'));
    pickBasics();
    fireEvent.click(screen.getByTestId('interest-send'));
    await waitFor(() => expect(postInterest).toHaveBeenCalled());
    expect(postInterest.mock.calls[0][0]).toMatchObject({ contact: '@bob', contactVia: 'discord' });
  });

  it('pre-selects chips and carries text over from a prefill', () => {
    render(<InterestDialog open onClose={vi.fn()} prefill={{ capabilities: ['community'], description: 'Mod my Discord' }} />);
    expect(screen.getByTestId('interest-cap-community')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('interest-description')).toHaveValue('Mod my Discord');
  });
});

describe('openInterest / InterestDialogHost', () => {
  it('opens the mounted dialog from the module-level request and closes it again', () => {
    render(<InterestDialogHost />);
    expect(screen.queryByTestId('interest-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
    act(() => openInterest({ capabilities: ['token'] }));
    expect(getInterestRequest()?.seq).toBe(1);
    expect(screen.getByTestId('modal')).toHaveAttribute('open');
    expect(screen.getByTestId('interest-cap-token')).toHaveAttribute('aria-checked', 'true');
    act(() => closeInterest());
    expect(getInterestRequest()).toBeNull();
    expect(screen.getByTestId('modal')).not.toHaveAttribute('open');
  });
});

describe('tallyLine', () => {
  it('reads singular and plural', () => {
    expect(tallyLine(1)).toBe('1 agent wants this');
    expect(tallyLine(0)).toBe('0 agents want this');
    expect(tallyLine(1200)).toBe('1,200 agents want this');
  });
});
