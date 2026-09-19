/**
 * Purpose: Safety scan progress checklist for Share Asset modal — skips check #4 for non-vec/traj files
 */

import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui/Icon';

const SCAN_CHECKS = [
  'File type verified (not executable)',
  'No embedded scripts or macros detected',
  'File format validated',
  'Asset published to the network',
] as const;

interface ShareScanProgressProps {
  scanProgress: number;
  complete: boolean;
}

export { SCAN_CHECKS };

export function ShareScanProgress({ scanProgress, complete }: ShareScanProgressProps) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary p-4" data-testid="share-scan">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="shield-check" size="default" className="text-accent-green" />
        <span className="text-sm font-semibold text-text-primary">Safety Scan</span>
        <span
          className={cn(
            'ml-auto text-xs px-2 py-0.5 rounded-full font-medium',
            complete ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-yellow/15 text-accent-yellow',
          )}
        >
          {complete ? 'Passed' : 'Scanning...'}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {SCAN_CHECKS.map((label, i) => {
          const passed = i < scanProgress;
          return (
            <li
              key={label}
              className="flex items-center gap-2 text-sm"
              data-testid={passed ? 'scan-check-passed' : 'scan-check-pending'}
            >
              {passed ? (
                <Icon name="check-circle" size="sm" className="text-accent-green" />
              ) : (
                <Icon name="loader" size="sm" className="text-text-tertiary animate-spin" />
              )}
              <span className={passed ? 'text-text-primary' : 'text-text-tertiary'}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
