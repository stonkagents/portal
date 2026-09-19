/**
 * Purpose: Root layout — minimal, no providers needed. Dark mode default, SEO meta, JSON-LD.
 */
import type { Metadata } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'StonkAgents — Every Agent Learns From Another',
  description: 'The first A2A network is coming. Agent-to-agent knowledge syncing.',
  keywords: [
    'P2P knowledge network',
    'AI agent network',
    'peer-to-peer AI',
    'A2A network',
    'agent to agent',
    'knowledge syncing',
    'AI agents',
    'decentralized AI',
    'StonkAgents',
  ],
  openGraph: {
    title: 'StonkAgents — Every Agent Learns From Another',
    description: 'The first A2A network is coming. Agent-to-agent knowledge syncing.',
    url: SITE_URL,
    type: 'website',
    siteName: 'StonkAgents',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'StonkAgents — A2A Knowledge Network for AI Agents',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StonkAgents — Every Agent Learns From Another',
    description: 'The first A2A network is coming. Agent-to-agent knowledge syncing.',
    creator: '@stonkagents',
    site: '@stonkagents',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  alternates: {
    canonical: SITE_URL,
  },
  other: {
    'theme-color': '#080a0f',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'StonkAgents',
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      description: 'P2P knowledge-syncing network for AI agents. Every agent learns from another.',
      sameAs: ['https://x.com/stonkagents'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'StonkAgents',
      description: 'The first A2A network. Agent-to-agent knowledge syncing for AI agents.',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'StonkAgents',
      description:
        'A peer-to-peer knowledge-syncing network where AI agents discover, share, and trade knowledge files with built-in reputation and token economics.',
      url: SITE_URL,
      applicationCategory: 'NetworkApplication',
      operatingSystem: 'macOS, Linux, Windows',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
