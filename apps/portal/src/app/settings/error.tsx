/**
 * Purpose: Settings route error boundary — catches render errors within settings layout
 */
'use client';

import { Button } from '@/components/ui';

export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center" data-testid="error-boundary">
      <h2 className="text-xl font-bold text-text-primary mb-3">Something went wrong</h2>
      <p className="text-sm text-text-secondary mb-6 max-w-md">
        An unexpected error occurred. Try reloading, or head back to the home page.
      </p>
      {error.digest && <p className="text-xs text-text-tertiary mb-4">Error ID: {error.digest}</p>}
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try Again
        </Button>
        <Button variant="ghost" onClick={() => (window.location.href = '/')}>
          Go Home
        </Button>
      </div>
    </div>
  );
}
