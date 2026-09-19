/**
 * Purpose: React provider that registers WebMCP tools on mount
 */
'use client';

import { useEffect } from 'react';
import { registerWebMCPTools } from '@/lib/webmcp/register-tools';

export function WebMCPProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerWebMCPTools();
  }, []);

  return <>{children}</>;
}
