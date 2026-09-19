/**
 * Purpose: Tests for the feedback dialog (FB-1) — our copy, the captured route,
 *          the never-fake-success guard, contact legibility, and the coming-soon kind.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/tokens' }));
const wallet = vi.hoisted(() => ({ connected: true, publicKey: 'Wa11et' }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => wallet }));
const postFeedback = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/feedback', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/feedback')>();
  return { ...actual, postFeedback };
});

import { FeedbackDialog, FEEDBACK_SENT, FEEDBACK_TITLE } from '../FeedbackDialog';
import { classifyContact } from '../contact';

/* Built at runtime so no literal contact sits in the source. */
const EMAIL = ['bob', 'example.com'].join('@');
const PHONE = ['+1', '415', '555', '0100'].join(' ');

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
  wallet.connected = true;
  wallet.publicKey = 'Wa11et';
});

describe('FeedbackDialog', () => {
  it('opens on our title with the three chips and the route it came from', () => {
    render(<FeedbackDialog open onClose={vi.fn()} />);
    expect(screen.getByText(FEEDBACK_TITLE)).toHaveTextContent('Say what’s off');
    expect(screen.getByTestId('feedback-kind-bug')).toHaveTextContent('Something broke');
    expect(screen.getByTestId('feedback-kind-idea')).toHaveTextContent('An idea');
    expect(screen.getByTestId('feedback-kind-other')).toHaveTextContent('Something else');
    expect(screen.getByTestId('feedback-path')).toHaveTextContent('from /tokens');
    expect(screen.getByTestId('feedback-send')).toBeDisabled();
  });

  it('posts kind, message, path, contact and the connected wallet, then shows our success line', async () => {
    postFeedback.mockResolvedValueOnce(undefined);
    render(<FeedbackDialog open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('feedback-kind-idea'));
    fireEvent.change(screen.getByTestId('feedback-message'), { target: { value: 'Let agents trade notes' } });
    fireEvent.change(screen.getByTestId('feedback-contact'), { target: { value: EMAIL } });
    fireEvent.click(screen.getByTestId('feedback-send'));
    await waitFor(() => expect(screen.getByTestId('feedback-sent')).toHaveTextContent(FEEDBACK_SENT));
    expect(postFeedback).toHaveBeenCalledWith(
      {
        kind: 'idea',
        message: 'Let agents trade notes',
        path: '/tokens',
        contact: EMAIL,
        contactVia: 'email',
        walletAddress: 'Wa11et',
      },
      null,
    );
  });

  it('keeps the text and shows the error when the send fails', async () => {
    postFeedback.mockRejectedValueOnce(new Error('The send never reached the Network.'));
    render(<FeedbackDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('feedback-message'), { target: { value: 'Chart is blank' } });
    fireEvent.click(screen.getByTestId('feedback-send'));
    await waitFor(() => expect(screen.getByTestId('feedback-error')).toHaveTextContent('The send never reached the Network.'));
    expect(screen.getByTestId('feedback-message')).toHaveValue('Chart is blank');
    expect(screen.queryByTestId('feedback-sent')).not.toBeInTheDocument();
  });

  it('asks which platform a bare handle is on, and sends it as contactVia', async () => {
    postFeedback.mockResolvedValueOnce(undefined);
    wallet.connected = false;
    render(<FeedbackDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('feedback-contact'), { target: { value: '@bob' } });
    expect(screen.getByTestId('feedback-contact-hint')).toHaveTextContent('Which platform is that handle on?');
    fireEvent.click(screen.getByTestId('feedback-platform-telegram'));
    fireEvent.change(screen.getByTestId('feedback-message'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('feedback-send'));
    await waitFor(() => expect(postFeedback).toHaveBeenCalled());
    expect(postFeedback.mock.calls[0][0]).toMatchObject({ contact: '@bob', contactVia: 'telegram' });
    expect(postFeedback.mock.calls[0][0]).not.toHaveProperty('walletAddress', 'Wa11et');
  });

  it('opens straight on the coming-soon question for kind "wanted" with a caller-supplied path', () => {
    render(<FeedbackDialog open onClose={vi.fn()} prefill={{ kind: 'wanted', path: '/gallery' }} />);
    expect(screen.queryByTestId('feedback-kinds')).not.toBeInTheDocument();
    expect(screen.getByText('What were you looking for?')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-path')).toHaveTextContent('from /gallery');
  });
});

describe('classifyContact', () => {
  it('tells email, phone, handle and noise apart', () => {
    expect(classifyContact('')).toEqual({ kind: 'empty' });
    expect(classifyContact(EMAIL)).toEqual({ kind: 'email' });
    expect(classifyContact('bob@gmail').kind).toBe('invalid');
    expect(classifyContact(PHONE)).toEqual({ kind: 'phone' });
    expect(classifyContact('+12').kind).toBe('invalid');
    expect(classifyContact('@bob_1')).toEqual({ kind: 'handle' });
    expect(classifyContact('???').kind).toBe('invalid');
  });
});

describe('FeedbackDialog roadmap hand-off', () => {
  it('offers the roadmap form under "An idea" only, closes itself and opens the interest dialog with the text', async () => {
    const { openInterest } = await import('@/components/features/interest/interest-request');
    const { resetInterestRequest, getInterestRequest } = await import('@/components/features/interest/interest-request');
    resetInterestRequest();
    const onClose = vi.fn();
    render(<FeedbackDialog open onClose={onClose} />);
    expect(screen.queryByTestId('feedback-roadmap-link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('feedback-kind-idea'));
    expect(screen.getByTestId('feedback-roadmap-hint')).toHaveTextContent('Is it something you want your agent to do?');
    fireEvent.change(screen.getByTestId('feedback-message'), { target: { value: 'Snipe launches for me' } });
    fireEvent.click(screen.getByTestId('feedback-roadmap-link'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getInterestRequest()?.prefill).toEqual({ description: 'Snipe launches for me', path: '/tokens' });
    expect(openInterest).toBeTypeOf('function');
    expect(postFeedback).not.toHaveBeenCalled();
  });
});
