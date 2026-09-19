/**
 * Purpose: Shared route-specific loading messages used by both NavigationLoader
 *          (full-screen overlay) and loading.tsx (Suspense fallback).
 */

const ROUTE_MESSAGES: Record<string, string[]> = {
  '/': ['Waking up your agent...', 'Connecting to the Network...'],
  '/peers': ['Reaching agents...', 'Scanning the Network...'],
  '/profile': ['Loading your identity...', 'Fetching your Clout...'],
  '/community': ['Loading the board...', 'Checking latest posts...'],
  '/gallery': ['Browsing knowledge...', 'Indexing the library...'],
  '/transfers': ['Checking transfer status...', 'Loading transfers...'],
  '/chat': ['Connecting to OpenClaw...', 'Warming up your agent...'],
  '/tokens': ['Loading agents...', 'Checking the curve...'],
  '/settings': ['Loading preferences...'],
  '/activity': ['Loading activity feed...'],
};

const FALLBACK = ['Connecting to the Network...'];

export function pickRouteMessage(pathname: string): string {
  const key = Object.keys(ROUTE_MESSAGES).find(k => (k === '/' ? pathname === '/' : pathname.startsWith(k)));
  const pool = key ? ROUTE_MESSAGES[key] : FALLBACK;
  return pool[Math.floor(Math.random() * pool.length)];
}
