/**
 * Purpose: Share complete confirmation — displays CID with copy button after successful upload + scan
 */

import { Icon } from '@/components/ui/Icon';

interface ShareCompleteConfirmationProps {
  cid: string;
  onCopyCid: () => void;
}

export function ShareCompleteConfirmation({ cid, onCopyCid }: ShareCompleteConfirmationProps) {
  return (
    <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-4" data-testid="share-complete-confirmation">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="check-circle" size="default" className="text-accent-green" />
        <span className="text-sm font-semibold text-accent-green">Asset Live on Swarm</span>
      </div>
      <div className="flex items-center gap-2 bg-bg-tertiary rounded px-3 py-2">
        <span
          className="text-xs font-mono text-text-primary truncate flex-1"
          data-testid="share-complete-cid"
        >
          {cid}
        </span>
        <button
          onClick={onCopyCid}
          className="shrink-0 p-1 rounded hover:bg-accent-green/10 transition-colors"
          data-testid="share-complete-copy-btn"
          title="Copy CID"
        >
          <Icon name="copy" size="sm" className="text-text-secondary hover:text-accent-green" />
        </button>
      </div>
    </div>
  );
}
