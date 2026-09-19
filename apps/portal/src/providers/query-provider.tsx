/**
 * Purpose: React Query provider — wraps app with QueryClientProvider, bridges global error handler to toast
 */
'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/api/query-client';
import { globalErrorRef } from '@/lib/api/global-error-handler';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { useToast } from '@/providers/ToastProvider';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const { addToast } = useToast();

  useEffect(() => {
    globalErrorRef.current = (error: unknown) => {
      const msg = mapErrorToUserMessage(error);
      if (!msg) return;
      addToast({ title: msg.title, description: msg.description, variant: msg.variant });
    };

    return () => {
      globalErrorRef.current = null;
    };
  }, [addToast]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
