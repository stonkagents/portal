/**
 * Purpose: The map's resting state. Static (no animation) so a page with the map below
 *          the fold costs nothing until it scrolls into view; the same surface shows the
 *          loading text while the renderer chunk arrives and the retry button when it fails.
 */

import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui';

type PlaceholderState = 'idle' | 'loading' | 'unavailable';

interface NetworkMapPlaceholderProps {
  state: PlaceholderState;
  onRetry?: () => void;
}

export function NetworkMapPlaceholder({ state, onRetry }: NetworkMapPlaceholderProps) {
  const unavailable = state === 'unavailable';
  return (
    <div
      className="absolute inset-0 z-[5] overflow-hidden"
      data-testid={unavailable ? 'network-map-unavailable' : 'network-map-placeholder'}
      data-state={state}
    >
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--color-accent-green) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div
          className={cn(
            'w-16 h-16 rounded-full border flex items-center justify-center',
            unavailable ? 'bg-accent-red/5 border-accent-red/20' : 'bg-accent-green/5 border-accent-green/10',
          )}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={unavailable ? 'text-accent-red/50' : 'text-accent-green/30'}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        {state === 'loading' && <span className="text-xs text-text-tertiary font-mono">Loading network map...</span>}
        {unavailable && (
          <>
            <span className="text-xs text-text-secondary font-mono">Map unavailable</span>
            <Button variant="secondary" size="sm" onClick={onRetry} data-testid="network-map-retry">
              Retry
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
