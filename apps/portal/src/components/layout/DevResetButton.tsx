/**
 * Purpose: Dev-only floating button to clear all localStorage/session data.
 *          Only rendered when NODE_ENV === 'development'. Never ships to production.
 */
'use client';

import { useState } from 'react';
import { clearAllStoredData } from '@/lib/user-profile';

const IS_DEV = process.env.NODE_ENV === 'development';

export function DevResetButton() {
  const [confirmed, setConfirmed] = useState(false);

  if (!IS_DEV) return null;

  function handleReset() {
    if (!confirmed) {
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
      return;
    }
    clearAllStoredData();
    window.location.reload();
  }

  const bg = confirmed ? 'rgba(255, 77, 77, 0.15)' : 'rgba(255, 255, 255, 0.05)';
  const border = confirmed ? 'rgba(255, 77, 77, 0.4)' : 'rgba(255, 255, 255, 0.1)';
  const color = confirmed ? '#FF4D4D' : '#555';

  return (
    <button
      data-testid="dev-reset-button"
      onClick={handleReset}
      title="Clear all StonkAgents localStorage and session data"
      /* Bottom left, clear of the Next.js dev indicator: the bottom-right corner belongs to the
         chat setup pill and the holder chat launcher, which this button used to cover. */
      className="fixed bottom-20 left-16 z-[200] px-3 py-2 text-[11px] font-mono font-bold rounded-md border cursor-pointer transition-all lg:bottom-4"
      style={{ backgroundColor: bg, borderColor: border, color }}
    >
      {confirmed ? 'CONFIRM RESET?' : 'DEV: Reset'}
    </button>
  );
}
