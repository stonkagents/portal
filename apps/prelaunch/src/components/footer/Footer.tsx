/**
 * Purpose: Minimal footer with brand, privacy/terms links, and X profile link.
 */

import { ClawLogo } from '@/components/brand/ClawLogo';

const X_PROFILE_URL = 'https://x.com/stonkagents';

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-auto py-8 px-4 border-t border-border-default">
      <div className="max-w-2xl mx-auto flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <ClawLogo size="sm" />
          <span className="font-mono text-[var(--text-sm)] text-text-secondary">StonkAgents</span>
        </div>

        <nav className="flex items-center gap-6 text-[var(--text-xs)] text-text-tertiary">
          <a data-testid="footer-privacy-link" href="/privacy/" className="hover:text-accent-green transition-colors duration-150">
            Privacy
          </a>
          <a data-testid="footer-terms-link" href="/terms/" className="hover:text-accent-green transition-colors duration-150">
            Terms
          </a>
          <a
            data-testid="footer-x-link"
            href={X_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-accent-green transition-colors duration-150"
          >
            <XIcon />
            <span>@stonkagents</span>
          </a>
        </nav>

        <p className="text-[var(--text-xs)] text-text-tertiary tracking-wide">Zero tracking. Zero cookies. Just vibes.</p>
      </div>
    </footer>
  );
}
