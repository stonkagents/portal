/**
 * The trade panel's non-trading states: a titled card with a message, and the
 * venue links a graduated or unreadable pool falls back to.
 */

'use client';

import { jupiterSwapUrl, raydiumTokenUrl } from '@/lib/launchlab/venues';
import type { GalleryToken } from '../_lib/gallery-token';
import { SectionCard } from './DetailPrimitives';

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <SectionCard title={title} data-testid="token-trading">
      {children}
    </SectionCard>
  );
}

export function VenueLinks({ token, quoteMint }: { token: GalleryToken; quoteMint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <a
        href={raydiumTokenUrl(token.mint)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent-green px-4 text-sm font-semibold text-black hover:brightness-110"
        data-testid="trade-on-raydium"
      >
        Trade on Raydium ↗
      </a>
      {quoteMint && (
        <a
          href={jupiterSwapUrl(quoteMint, token.mint)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border-default px-4 text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary"
        >
          Swap on Jupiter ↗
        </a>
      )}
    </div>
  );
}

