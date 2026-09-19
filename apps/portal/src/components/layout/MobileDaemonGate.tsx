/**
 * Purpose: Bottom sheet that intercepts agent-dependent actions on mobile.
 *          When a mobile user taps a write action (post, upvote, launch agent, etc.),
 *          this gate shows instead — directing them to Follow on X or Explore.
 */
'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { useDeviceType } from '@/lib/hooks/use-device-type';
import { useDaemon } from '@/providers/DaemonProvider';

const X_FOLLOW_URL = 'https://x.com/stonkagents';

interface MobileDaemonGateProps {
  children: ReactNode;
  /** Optional label for what the user tried to do */
  actionLabel?: string;
}

/**
 * Wraps an interactive element. On mobile without daemon, intercepts the click
 * and shows a bottom sheet instead. On desktop or when daemon is connected,
 * renders children normally.
 */
export function MobileDaemonGate({ children, actionLabel }: MobileDaemonGateProps) {
  const { isMobile } = useDeviceType();
  const { connected } = useDaemon();
  const [open, setOpen] = useState(false);

  const shouldGate = isMobile && !connected;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!shouldGate) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    },
    [shouldGate],
  );

  return (
    <>
      {/* Wrap children with click interceptor */}
      <div
        role="presentation"
        onClick={handleClick}
        onKeyDown={handleClick as unknown as React.KeyboardEventHandler}
        data-testid="daemon-gate-wrapper"
      >
        {children}
      </div>

      {/* Bottom sheet overlay */}
      {open && (
        <div className="fixed inset-0 z-[400] flex items-end justify-center" data-testid="daemon-gate-overlay">
          {/* Backdrop */}
          <div
            role="presentation"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            onKeyDown={() => setOpen(false)}
            data-testid="daemon-gate-backdrop"
          />

          {/* Sheet */}
          <div
            className="relative w-full max-w-[500px] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-bg-secondary border-t border-border-default rounded-t-2xl p-5 pb-[max(2rem,env(safe-area-inset-bottom))] animate-[slide-up_0.25s_ease-out]"
            data-testid="daemon-gate-sheet"
          >
            {/* Dismiss handle */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-border-default" />
            </div>

            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors"
              data-testid="daemon-gate-close"
              aria-label="Dismiss"
            >
              <Icon name="x-close" size="sm" />
            </button>

            {/* Content */}
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
                <Icon name="monitor" size="lg" className="text-accent-green" />
              </div>

              <h3 className="text-base font-bold text-text-primary mb-1">Desktop Feature</h3>
              <p className="text-sm text-text-secondary mb-5 leading-relaxed">
                {actionLabel
                  ? `"${actionLabel}" requires the StonkAgents desktop app.`
                  : 'This feature requires the StonkAgents desktop app.'}{' '}
                Follow us to stay updated!
              </p>

              {/* Primary CTA: Follow on X */}
              <a
                href={X_FOLLOW_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="daemon-gate-follow-x"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-accent-green text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] transition-[box-shadow] min-h-[44px] no-underline"
              >
                <Icon name="x-twitter" size="sm" />
                Follow @stonkagents on X
              </a>

              {/* Secondary: Explore */}
              <a
                href="/gallery"
                data-testid="daemon-gate-explore"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 mt-2 text-sm font-semibold text-accent-green bg-accent-green/8 border border-accent-green/20 rounded-lg hover:bg-accent-green/15 transition-colors min-h-[44px] no-underline"
                onClick={() => setOpen(false)}
              >
                <Icon name="globe" size="sm" />
                Explore the Network
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
