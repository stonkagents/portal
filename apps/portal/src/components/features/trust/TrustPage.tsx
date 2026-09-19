/**
 * The frame every trust page shares: terms, privacy, contact. Plain text in
 * the app's own type, versioned and dated, so a reader (or a wallet's domain
 * reviewer) sees when it was last looked at.
 */
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';

interface TrustPageProps {
  title: string;
  subtitle: string;
  /** "v1" and the day it was written, shown under the title. */
  version: string;
  date: string;
  testId: string;
  children: ReactNode;
}

const BODY_CLASS = [
  'flex flex-col gap-5 text-sm leading-relaxed text-text-secondary',
  '[&_h2]:text-base [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mt-2',
  '[&_a]:text-accent-green [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1',
].join(' ');

export function TrustPage({ title, subtitle, version, date, testId, children }: TrustPageProps) {
  return (
    <div className="flex-1 min-w-0 p-4 flex flex-col gap-6 max-w-[760px] mx-auto w-full" data-testid={testId}>
      <PageHeader title={title} subtitle={subtitle} />
      <p className="text-xs font-mono text-text-tertiary" data-testid={`${testId}-version`}>
        {version}, {date}
      </p>
      <div className={BODY_CLASS}>{children}</div>
    </div>
  );
}
