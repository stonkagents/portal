/**
 * Agents route error boundary — catches render errors within the agent pages.
 */
'use client';

import { Button } from '@/components/ui';

export default function AgentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center" data-testid="error-boundary">
      <h2 className="mb-3 text-xl font-bold text-text-primary">Something went wrong</h2>
      <p className="mb-6 max-w-md text-sm text-text-secondary">
        An unexpected error occurred loading Agents. Try reloading, or head back to the home page.
      </p>
      {error.digest && <p className="mb-4 text-xs text-text-tertiary">Error ID: {error.digest}</p>}
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghost" onClick={() => (window.location.href = '/')}>
          Go home
        </Button>
      </div>
    </div>
  );
}
