import type { Metadata, Viewport } from 'next';
import { config } from '@/config';
import { CSP } from '@/lib/csp';
import { LayoutShell } from '@/components/layout';
import { SolanaProvider } from '@/providers/SolanaProvider';
import { QueryProvider } from '@/providers/query-provider';
import { I18nProvider } from '@/providers/I18nProvider';
import { DaemonProvider } from '@/providers/DaemonProvider';
import { EventProvider } from '@/providers/EventProvider';
import { PageReadinessProvider } from '@/providers/PageReadinessProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { WebMCPProvider } from '@/components/webmcp/WebMCPProvider';
import './globals.css';
import { fontClassName } from './fonts';

const PAGE_TITLE = `${config.brand.name} | ${config.brand.tagline}`;
/* Every social card and search snippet names the brand and its one official domain. */
const SITE_URL = `https://${config.brand.domain}`;
const PAGE_DESCRIPTION = `${config.brand.slogan}. ${config.brand.domain} is the official ${config.brand.name} domain.`;


/* viewport-fit=cover lets the page paint under the iPhone notch and home indicator, so the fixed
 * chrome (navbar, bottom tab bar, toasts) can pad itself with env(safe-area-inset-*). */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  applicationName: config.brand.name,
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/icon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/icons/icon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/loading-robo-head.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    siteName: config.brand.name,
    images: [{ url: '/icons/icon-512x512.png', width: 512, height: 512, alt: config.brand.name }],
  },
  twitter: {
    card: 'summary',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    site: config.brand.handle,
    images: ['/icons/icon-512x512.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${fontClassName}`}>
      <head>
        {/* CSP meta tag — defense-in-depth for local dev.
            Production uses CloudFront Response Headers Policy (stricter).
            frame-src allows token chart iframes (Birdeye, DexScreener). */}
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body suppressHydrationWarning>
        <PageReadinessProvider>
          <SolanaProvider>
            <I18nProvider>
              <ToastProvider>
                <QueryProvider>
                  <DaemonProvider>
                    <EventProvider>
                      <WebMCPProvider>
                        <LayoutShell>{children}</LayoutShell>
                      </WebMCPProvider>
                    </EventProvider>
                  </DaemonProvider>
                </QueryProvider>
              </ToastProvider>
            </I18nProvider>
          </SolanaProvider>
        </PageReadinessProvider>
      </body>
    </html>
  );
}
