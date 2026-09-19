/**
 * Step 2 on a phone. The token is live; the agent itself runs on a Windows
 * desktop, so this is the honest "coming soon" state with a link to carry over.
 * No daemon can run here, so nothing arms a detection watch.
 */
'use client';

import { Icon } from '@/components/ui';
import { ClawMascot } from '@/components/brand/ClawMascot';
import { useToast } from '@/providers/ToastProvider';
import { useInterest } from '@/components/features/interest';
import type { InstallerDownloads } from '@/lib/installer/use-installer-downloads';
import { StepBullets } from './StepBullets';

interface MobileAgentStepProps {
  downloads: InstallerDownloads;
  tokenSymbol?: string | null;
}

export function MobileAgentStep({ downloads, tokenSymbol }: MobileAgentStepProps) {
  const { addToast } = useToast();
  const { open: openInterest } = useInterest();

  const copy = async () => {
    const link = downloads.windows ?? (typeof window !== 'undefined' ? window.location.href : '');
    try {
      await navigator.clipboard.writeText(link);
      addToast({
        title: 'Link copied',
        description: 'Open it on a Windows machine to run your agent.',
        variant: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast({ title: 'Could not copy the link', variant: 'error', autoDismiss: true });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="mobile-agent-step">
      <div className="flex items-center gap-3">
        <ClawMascot variant="online" animation="bounce" size="sm" />
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-text-primary m-0">Run your Agent</h2>
          <StepBullets active={2} />
        </div>
      </div>

      <div
        className="flex items-start gap-3 p-3 rounded-md bg-bg-tertiary border border-border-default"
        data-testid="mobile-coming-soon"
      >
        <Icon name="clock" size="sm" className="text-text-tertiary shrink-0 mt-0.5" />
        <p className="m-0 text-sm text-text-secondary leading-relaxed">
          <span className="text-text-primary font-semibold">Coming soon on phones.</span>{' '}
          {tokenSymbol ? `$${tokenSymbol} is live.` : 'Your token is live.'} Your agent runs on a Windows desktop today. Open this page
          there to install it, and it binds to your token automatically.
        </p>
      </div>

      <button
        type="button"
        onClick={copy}
        data-testid="mobile-copy-download"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-3 text-sm font-bold text-black border-none cursor-pointer"
      >
        <Icon name="copy" size="sm" />
        Copy link for your desktop
      </button>
      <button
        type="button"
        onClick={() => openInterest()}
        data-testid="mobile-coming-soon-feedback"
        className="w-full text-center text-xs text-text-tertiary bg-transparent border-none cursor-pointer hover:text-accent-green"
      >
        Tell us what you wanted
      </button>
    </div>
  );
}
