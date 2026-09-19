/* DELETE ME — Dev-only design system showcase. Remove before production. */
'use client';

import { ToastProvider } from '@/components/ui';

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
