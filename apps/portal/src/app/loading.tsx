/**
 * Purpose: Root-level Suspense fallback — shows during React's rendering transition
 *          (component mount phase). Complements NavigationLoader which covers the
 *          click-to-render gap. Also serves as in-page loading for data fetches.
 */
'use client';

import { usePathname } from 'next/navigation';
import { pickRouteMessage } from '@/lib/route-messages';

export default function Loading() {
  const pathname = usePathname();
  const message = pickRouteMessage(pathname);

  return (
    <div className="flex flex-1 items-center justify-center min-h-[40vh]" data-testid="route-loading">
      <div className="flex flex-col items-center gap-3">
        {/* Neon loading dots */}
        <div className="flex gap-[7px]">
          {[0, 0.2, 0.4].map((delay, i) => (
            <span
              key={i}
              className="w-[7px] h-[7px] rounded-full bg-accent-green"
              style={{
                boxShadow: '0 0 8px var(--color-accent-green), 0 0 20px rgba(0,255,0,0.4)',
                animation: `neon-dot 1.4s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
        <span className="text-xs text-text-tertiary font-mono uppercase tracking-[0.1em]">{message}</span>
      </div>
    </div>
  );
}
