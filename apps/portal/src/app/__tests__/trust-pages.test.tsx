/**
 * The trust pages a wallet's domain review reads: terms, privacy and contact
 * render as plain versioned text, name the official domain, and the contact
 * page shows the mailbox and X handle only when they are configured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  ),
}));

const links = vi.hoisted(() => ({ x: '', contactEmail: '', github: '' }));
vi.mock('@/config', async () => {
  const actual = await vi.importActual<{ config: Record<string, unknown> }>('@/config');
  const base = actual.config;
  return {
    ...actual,
    config: {
      ...base,
      links: {
        ...(base.links as Record<string, unknown>),
        get x() {
          return links.x;
        },
        get contactEmail() {
          return links.contactEmail;
        },
        get github() {
          return links.github;
        },
      },
    },
  };
});

import TermsPage from '../terms/page';
import PrivacyPage from '../privacy/page';
import ContactPage from '../contact/page';

beforeEach(() => {
  links.x = '';
  links.contactEmail = '';
  links.github = '';
});

describe('trust pages', () => {
  it('terms: versioned, no custody, no login signatures, links to privacy and contact', () => {
    render(<TermsPage />);
    expect(screen.getByTestId('terms-page-version')).toHaveTextContent('v1, 16 September 2026');
    expect(screen.getByText(/never holds your funds and never sees your private keys/)).toBeInTheDocument();
    expect(screen.getByText(/never asks you to sign a message to log in/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact page' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', '/privacy');
  });

  it('privacy: versioned, names the tracker and the third parties, links to contact and terms', () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId('privacy-page-version')).toHaveTextContent('v1, 16 September 2026');
    expect(screen.getByText(/our own tracker service/)).toBeInTheDocument();
    expect(screen.getByText(/Alchemy.*Jupiter and Raydium/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact page' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'terms page' })).toHaveAttribute('href', '/terms');
  });

  it('contact: names the official domain; GitHub, email and X only when configured', () => {
    const { unmount } = render(<ContactPage />);
    expect(screen.getByTestId('contact-domain')).toHaveAttribute('href', 'https://stonkagents.com');
    expect(screen.getByTestId('contact-domain').parentElement).toHaveTextContent('stonkagents.com is the official StonkAgents domain.');
    expect(screen.queryByTestId('contact-github')).not.toBeInTheDocument();
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
    expect(screen.getByTestId('contact-email-unset')).toBeInTheDocument();
    expect(screen.queryByTestId('contact-x')).not.toBeInTheDocument();
    unmount();

    links.x = 'https://x.com/stonkagents';
    links.contactEmail = 'hello@stonkagents.com';
    links.github = 'https://github.com/stonkagents';
    render(<ContactPage />);
    expect(screen.getByTestId('contact-email')).toHaveAttribute('href', 'mailto:hello@stonkagents.com');
    expect(screen.getByTestId('contact-x')).toHaveAttribute('href', 'https://x.com/stonkagents');
    expect(screen.getByTestId('contact-github')).toHaveAttribute('href', 'https://github.com/stonkagents');
    expect(screen.getByText('Elsewhere')).toBeInTheDocument();
    expect(screen.queryByTestId('contact-email-unset')).not.toBeInTheDocument();
  });
});
