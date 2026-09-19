'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { config } from '@/config';
import { useTranslation } from '@/providers/I18nProvider';
import { useTheme, type Theme, type LightVariant } from '@/lib/store/theme';
import { useDaemon } from '@/providers/DaemonProvider';
import { useUpdateStatus } from '@/lib/api/hooks/use-update-status';
import { useFeedback } from '@/components/features/feedback';
import { APP_VERSION, IS_PRODUCTION_ENV } from '@/lib/version';

/* S4: "Get Started" and "Leaderboard" are gone; Feedback (FB-1) opens the dialog. */
const platformLinks = [
  { i18nKey: 'footer.knowledgeGallery', href: '/gallery' },
  { i18nKey: 'nav.agents', href: '/tokens' },
  { i18nKey: 'footer.community', href: '/community' },
  { i18nKey: 'footer.agentBoard', href: '/chat' },
];

const FEEDBACK_LABEL = 'Feedback';
/* 44px rows on phones and tablets (the bar is the only navigation there); plain text rows from 900px. */
const LINK_CLASS = 'inline-flex min-h-[44px] items-center text-sm text-text-secondary no-underline hover:text-accent-green transition-colors lg:min-h-0';
const SOCIAL_CLASS =
  'flex items-center justify-center w-11 h-11 rounded-sm text-text-secondary hover:text-accent-green hover:bg-accent-green/5 transition-colors';

/* The pages a wallet reviewer, or anyone, looks for: what we keep, what you accept, how to reach us. */
const legalLinks = [
  { i18nKey: 'footer.privacyPolicy', href: '/privacy', testId: 'footer-legal-privacy-policy' },
  { i18nKey: 'footer.termsOfService', href: '/terms', testId: 'footer-legal-terms-of-service' },
  { i18nKey: 'footer.contact', href: '/contact', testId: 'footer-legal-contact' },
];

const THEME_OPTIONS: { value: Theme; icon: 'moon' | 'sun' | 'monitor'; label: string }[] = [
  { value: 'dark', icon: 'moon', label: 'Dark' },
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'system', icon: 'monitor', label: 'System' },
];

const LIGHT_VARIANTS: { value: LightVariant; label: string }[] = [
  { value: 'default', label: 'Cool' },
  { value: 'warm', label: 'Warm' },
  { value: 'frost', label: 'Frost' },
];

export function Footer() {
  const { t } = useTranslation();
  const { theme, setTheme, lightVariant, setLightVariant } = useTheme();
  const { connected } = useDaemon();
  /* The agent's own version stream, as the controller reports it; only asked while connected. */
  const { data: updateStatus } = useUpdateStatus();
  const agentVersion = connected ? updateStatus?.currentVersion || null : null;
  const { open: openFeedback } = useFeedback();
  // The OS preference is only known in the browser; resolve it after mount so the
  // server and the first client render agree (hydration).
  const [systemDark, setSystemDark] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const showVariants = resolvedTheme === 'light';

  /* The bottom padding keeps the last footer row clear of the mobile tab bar (76px plus the iOS home
     indicator); none from 900px, where the bar is gone. */
  return (
    <footer
      className="mt-auto border-t border-border-default bg-bg-primary pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0"
      data-testid="footer"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-10 lg:px-8">
        {/* Multi-column grid */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="text-base font-bold text-accent-green text-glow mb-2">StonkAgents</p>
            <p className="text-xs text-text-secondary leading-relaxed mb-4 max-w-[280px]" data-testid="footer-slogan">
              {config.brand.slogan}.
            </p>
            {/* Brand-to-domain tie-in: the one official domain, next to the org, the handle and a mailbox. */}
            <p className="text-xs text-text-tertiary leading-relaxed mb-3" data-testid="footer-official-domain">
              <a href={`https://${config.brand.domain}`} data-testid="footer-website" className="text-text-secondary no-underline hover:text-accent-green">
                {config.brand.domain}
              </a>{' '}
              is the official {config.brand.name} domain.
            </p>
            <div className="flex items-center gap-3">
              {config.links.x && (
                <a href={config.links.x} target="_blank" rel="noopener noreferrer" data-testid="footer-twitter" className={SOCIAL_CLASS} aria-label="X">
                  <Icon name="x-twitter" size="sm" />
                </a>
              )}
              {config.links.github && (
                <a href={config.links.github} target="_blank" rel="noopener noreferrer" data-testid="footer-github" className={SOCIAL_CLASS} aria-label="GitHub">
                  <Icon name="github" size="sm" />
                </a>
              )}
              {config.links.contactEmail && (
                <a href={`mailto:${config.links.contactEmail}`} data-testid="footer-email" className={SOCIAL_CLASS} aria-label="Email">
                  <Icon name="mail" size="sm" />
                </a>
              )}
            </div>
          </div>
          {/* Platform */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-3">{t('footer.platform')}</p>
            <ul className="list-none flex flex-col gap-0 lg:gap-2">
              {platformLinks.map(l => (
                <li key={l.i18nKey}>
                  <Link
                    href={l.href}
                    data-testid={`footer-${l.i18nKey
                      .split('.')
                      .pop()
                      ?.replace(/([A-Z])/g, '-$1')
                      .toLowerCase()}`}
                    className={LINK_CLASS}
                  >
                    {t(l.i18nKey)}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => openFeedback()}
                  data-testid="footer-feedback"
                  className={cn(LINK_CLASS, 'bg-transparent border-none p-0 cursor-pointer font-[inherit]')}
                >
                  {FEEDBACK_LABEL}
                </button>
              </li>
            </ul>
          </div>
          {/* Legal */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-3">{t('footer.legal')}</p>
            <ul className="list-none flex flex-col gap-0 lg:gap-2">
              {legalLinks.map(l => (
                <li key={l.href}>
                  <Link href={l.href} data-testid={l.testId} className={LINK_CLASS}>
                    {t(l.i18nKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {/* Bottom bar */}
      <div className="border-t border-border-default bg-bg-secondary/50 px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-[1400px] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* S3: dev and staging builds only; absent on production. */}
          {!IS_PRODUCTION_ENV && (
            <p className="text-[11px] text-accent-yellow font-mono" data-testid="footer-experimental">
              <Icon name="alert-triangle" size="sm" className="inline-block w-3 h-3 mr-1 align-text-bottom" />
              {t('footer.experimental')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary font-mono">
            {/* Theme toggle */}
            <div className="flex rounded-sm border border-border-default overflow-hidden" data-testid="theme-toggle">
              {THEME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  data-testid={`theme-${opt.value}`}
                  aria-label={`${opt.label} theme`}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-semibold border-none cursor-pointer transition-colors min-h-[44px] lg:min-h-[28px]',
                    theme === opt.value
                      ? 'bg-accent-green/12 text-accent-green'
                      : 'bg-transparent text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Icon name={opt.icon} size="sm" className="w-3 h-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
            {/* Light variant picker — only visible in light mode */}
            {showVariants && (
              <div className="flex rounded-sm border border-border-default overflow-hidden" data-testid="light-variant-toggle">
                {LIGHT_VARIANTS.map(v => (
                  <button
                    key={v.value}
                    onClick={() => setLightVariant(v.value)}
                    data-testid={`light-variant-${v.value}`}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-mono font-semibold border-none cursor-pointer transition-colors min-h-[44px] lg:min-h-[28px]',
                      lightVariant === v.value
                        ? 'bg-accent-green/12 text-accent-green'
                        : 'bg-transparent text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <span>&copy; {new Date().getFullYear()} StonkAgents. All rights reserved.</span>
            <span
              className="px-1.5 py-0.5 rounded-sm bg-accent-green/8 text-accent-green text-[11px] font-bold"
              data-testid="footer-version"
            >
              v{APP_VERSION}
            </span>
            {agentVersion && (
              <span
                className="px-1.5 py-0.5 rounded-sm bg-bg-tertiary text-text-secondary text-[11px] font-bold"
                data-testid="footer-agent-version"
              >
                agent v{agentVersion}
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
