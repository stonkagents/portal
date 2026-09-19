/**
 * Token detail: "The token" — what the mint account and the launch record say.
 * Mint, program, decimals, supply, transfer-fee config, authorities, metadata,
 * creator, created at, bound agent, quote.
 */

'use client';

import Link from 'next/link';
import { explorerUrl } from '@/config';
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from '@/lib/launchlab/constants';
import { bpsToPercent } from '@/lib/launchlab/pricing';
import { AgentName } from '@/lib/agent-name';
import { cn } from '@/lib/utils/cn';
import { truncateAddress, type GalleryToken } from '../_lib/gallery-token';
import { formatTokenAmount, timeAgo } from '../_lib/detail-format';
import { metadataHttpUrl, type TokenMetadata } from '../_lib/use-token-detail-data';
import type { MintInfo } from '../_lib/use-token-chain-data';
import { Chip, CopyAddress, SectionCard } from './DetailPrimitives';

interface TokenPanelProps {
  token: GalleryToken;
  mintInfo?: MintInfo | null;
  metadata?: TokenMetadata | null;
  quoteSymbol: string | null;
  /** Supply from the launch config, before the mint account has answered. */
  configSupply?: number | null;
}

export function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-t border-border-default py-2.5 first:border-t-0"
      data-testid={testId}
    >
      <span className="shrink-0 text-xs text-text-tertiary">{label}</span>
      <span className="min-w-0 text-right text-xs text-text-primary">{children}</span>
    </div>
  );
}

function programLabel(program: string | null | undefined, transferFeeBps: number | null): string {
  if (program === TOKEN_2022_PROGRAM) return 'Token-2022';
  if (program === TOKEN_PROGRAM) return 'SPL Token';
  if (program) return truncateAddress(program);
  return transferFeeBps != null ? 'Token-2022' : '-';
}

export function TokenPanel({ token, mintInfo, metadata, quoteSymbol, configSupply }: TokenPanelProps) {
  const supply = mintInfo?.supply ?? configSupply ?? null;
  const feeBps = mintInfo?.transferFee?.bps ?? token.transferFeeBps;
  const createdAt = new Date(token.launchedAt);

  return (
    <SectionCard title="The token" data-testid="token-panel">
      <Row label="Mint">
        <CopyAddress value={token.mint} label={truncateAddress(token.mint)} href={explorerUrl('token', token.mint)} />
      </Row>
      <Row label="Token program">
        <span className="font-mono">{programLabel(mintInfo?.program, token.transferFeeBps)}</span>
      </Row>
      <Row label="Decimals">
        <span className="font-mono">{mintInfo?.decimals ?? '-'}</span>
      </Row>
      <Row label="Total supply">
        <span className="font-mono">{supply != null && supply > 0 ? `${formatTokenAmount(supply)} ${token.symbol}` : '-'}</span>
      </Row>
      {feeBps != null && (
        <Row label="Transfer fee" testId="token-transfer-fee">
          <span className="font-mono">{bpsToPercent(feeBps)} to holders</span>
          {mintInfo?.transferFee && mintInfo.transferFee.withheld > 0 && (
            <span className="block text-[11px] text-text-tertiary">
              {formatTokenAmount(mintInfo.transferFee.withheld)} {token.symbol} collected, waiting to be paid out
            </span>
          )}
        </Row>
      )}
      {mintInfo && (
        <Row label="Mint authority">
          <span className="font-mono">{mintInfo.mintAuthority ? truncateAddress(mintInfo.mintAuthority) : 'None (fixed supply)'}</span>
        </Row>
      )}
      {mintInfo && (
        <Row label="Freeze authority">
          <span className="font-mono">{mintInfo.freezeAuthority ? truncateAddress(mintInfo.freezeAuthority) : 'None'}</span>
        </Row>
      )}
      {token.metadataUri && (
        <Row label="Metadata">
          <a
            href={metadataHttpUrl(token.metadataUri)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent-green hover:underline"
            title={token.metadataUri}
          >
            {token.metadataUri.length > 28 ? `${token.metadataUri.slice(0, 16)}…${token.metadataUri.slice(-8)}` : token.metadataUri} ↗
          </a>
        </Row>
      )}
      {token.imageUrl && (
        <Row label="Image">
          <a
            href={token.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-accent-green hover:underline"
          >
            <img
              src={token.imageThumbUrl ?? token.imageUrl}
              alt=""
              width={20}
              height={20}
              decoding="async"
              loading="lazy"
              className="h-5 w-5 rounded object-cover"
            />{' '}
            open ↗
          </a>
        </Row>
      )}
      {metadata?.description && (
        <div className="border-t border-border-default py-2.5">
          <p className="text-xs text-text-tertiary">Description</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{metadata.description}</p>
        </div>
      )}
      {token.launchedAt && (
        <Row label="Created">
          <span className="font-mono" title={token.launchedAt}>
            {Number.isNaN(createdAt.getTime())
              ? token.launchedAt
              : `${createdAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${timeAgo(token.launchedAt)}`}
          </span>
        </Row>
      )}
      {token.source !== 'legacy' && token.creator && (
        <Row label="Creator">
          <CopyAddress value={token.creator} label={truncateAddress(token.creator)} href={explorerUrl('address', token.creator)} />
        </Row>
      )}
      {token.launchSignature && (
        <Row label="Launch tx">
          <a
            href={explorerUrl('tx', token.launchSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent-green hover:underline"
          >
            {truncateAddress(token.launchSignature)} ↗
          </a>
        </Row>
      )}
      <Row label="Bound agent" testId="token-bound-agent">
        {token.peerId ? (
          <Link
            href="/peers"
            className={cn('inline-flex items-center gap-1.5 hover:text-accent-green', !token.peerDisplayName && 'font-mono')}
            title={token.peerId}
          >
            <AgentName displayName={token.peerDisplayName} peerId={token.peerId} title={token.peerId} href={null} />
            <Chip tone="purple" className="font-sans">
              live
            </Chip>
          </Link>
        ) : (
          <span className="text-text-tertiary">none yet</span>
        )}
      </Row>
      {token.quoteMint && (
        <Row label={`Quote${quoteSymbol ? ` · $${quoteSymbol}` : ''}`}>
          <span className="inline-flex items-center gap-1.5">
            {token.quoteCategoryLabel && (
              <Chip tone="neutral" className="font-sans">
                {token.quoteCategoryLabel}
              </Chip>
            )}
            <CopyAddress
              value={token.quoteMint}
              label={truncateAddress(token.quoteMint)}
              href={explorerUrl('token', token.quoteMint)}
            />
          </span>
        </Row>
      )}
    </SectionCard>
  );
}
