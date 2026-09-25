/**
 * Purpose: Tests for Footer — S1 slogan, S3 real version + agent version + env-gated banner,
 *          S4 dead links gone, FB-1 Feedback link opens the dialog, the official-domain line
 *          with its configured social links, and the legal pages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/providers/I18nProvider', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/store/theme', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn(), lightVariant: 'default', setLightVariant: vi.fn() }),
}));
vi.mock('@/components/ui', () => ({ Icon: () => <span /> }));

const daemon = vi.hoisted(() => ({ connected: false }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));

const update = vi.hoisted(() => ({ data: undefined as { currentVersion: string } | undefined }));
vi.mock('@/lib/api/hooks/use-update-status', () => ({ useUpdateStatus: () => update }));

const openFeedback = vi.hoisted(() => vi.fn());
vi.mock('@/components/features/feedback', () => ({ useFeedback: () => ({ open: openFeedback }) }));

const links = vi.hoisted(() => ({ x: '', contactEmail: '', github: '', docs: 'https://docs.stonkagents.com' }));
const features = vi.hoisted(() => ({ docsEnabled: false }));
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
        get docs() {
          return links.docs;
        },
      },
      features: {
        ...(base.features as Record<string, unknown>),
        get docsEnabled() {
          return features.docsEnabled;
        },
      },
    },
  };
});

const version = vi.hoisted(() => ({ app: '0.1.0', prod: false }));
vi.mock('@/lib/version', () => ({
  get APP_VERSION() {
    return version.app;
  },
  get IS_PRODUCTION_ENV() {
    return version.prod;
  },
}));

import { Footer } from '../Footer';

beforeEach(() => {
  vi.clearAllMocks();
  daemon.connected = false;
  update.data = undefined;
  version.app = '0.1.0';
  version.prod = false;
  links.x = '';
  links.contactEmail = '';
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe('Footer', () => {
  it('shows the real UI version from the build, not a hardcoded alpha', () => {
    render(<Footer />);
    expect(screen.getByTestId('footer-version')).toHaveTextContent('v0.1.0');
    expect(screen.queryByText(/alpha/)).not.toBeInTheDocument();
  });

  it('shows the agent version only while the agent is connected', () => {
    update.data = { currentVersion: '0.4.2' };
    const { unmount } = render(<Footer />);
    expect(screen.queryByTestId('footer-agent-version')).not.toBeInTheDocument();
    unmount();

    daemon.connected = true;
    render(<Footer />);
    expect(screen.getByTestId('footer-agent-version')).toHaveTextContent('agent v0.4.2');
  });

  it('carries the slogan as the brand line', () => {
    render(<Footer />);
    expect(screen.getByTestId('footer-slogan')).toHaveTextContent('Permissionless knowledge sharing for StonkAgents.');
  });

  it('has no Get Started or Leaderboard link, and keeps the four platform links', () => {
    render(<Footer />);
    expect(screen.queryByTestId('footer-get-started')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer-leaderboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('footer-knowledge-gallery')).toHaveAttribute('href', '/gallery');
    expect(screen.getByTestId('footer-agents')).toHaveAttribute('href', '/tokens');
    expect(screen.getByTestId('footer-community')).toHaveAttribute('href', '/community');
    expect(screen.getByTestId('footer-agent-board')).toHaveAttribute('href', '/chat');
  });

  it('Feedback opens the dialog', () => {
    render(<Footer />);
    const link = screen.getByTestId('footer-feedback');
    expect(link).toHaveTextContent('Feedback');
    fireEvent.click(link);
    expect(openFeedback).toHaveBeenCalledOnce();
  });

  it('names the official domain, and shows GitHub, X and email only when configured', () => {
    const { unmount } = render(<Footer />);
    expect(screen.getByTestId('footer-official-domain')).toHaveTextContent('stonkagents.com is the official StonkAgents domain.');
    expect(screen.getByTestId('footer-website')).toHaveAttribute('href', 'https://stonkagents.com');
    expect(screen.queryByTestId('footer-github')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer-twitter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer-email')).not.toBeInTheDocument();
    unmount();

    links.x = 'https://x.com/stonkagents';
    links.contactEmail = 'hello@stonkagents.com';
    links.github = 'https://github.com/stonkagents';
    render(<Footer />);
    expect(screen.getByTestId('footer-twitter')).toHaveAttribute('href', 'https://x.com/stonkagents');
    expect(screen.getByTestId('footer-email')).toHaveAttribute('href', 'mailto:hello@stonkagents.com');
    expect(screen.getByTestId('footer-github')).toHaveAttribute('href', 'https://github.com/stonkagents');
  });

  it('links the privacy, terms and contact pages', () => {
    render(<Footer />);
    expect(screen.getByTestId('footer-legal-privacy-policy')).toHaveAttribute('href', '/privacy');
    expect(screen.getByTestId('footer-legal-terms-of-service')).toHaveAttribute('href', '/terms');
    expect(screen.getByTestId('footer-legal-contact')).toHaveAttribute('href', '/contact');
  });

  it('links the documentation site only when the build enables docs', () => {
    features.docsEnabled = false;
    const { unmount } = render(<Footer />);
    expect(screen.queryByTestId('footer-docs')).toBeNull();
    unmount();

    features.docsEnabled = true;
    render(<Footer />);
    const docs = screen.getByTestId('footer-docs');
    expect(docs).toHaveAttribute('href', 'https://docs.stonkagents.com');
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    features.docsEnabled = false;
  });

  it('shows the experimental banner on dev and hides it on production', () => {
    const { unmount } = render(<Footer />);
    expect(screen.getByTestId('footer-experimental')).toBeInTheDocument();
    unmount();

    version.prod = true;
    render(<Footer />);
    expect(screen.queryByTestId('footer-experimental')).not.toBeInTheDocument();
  });
});
