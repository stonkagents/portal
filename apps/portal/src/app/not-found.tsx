/**
 * Purpose: Default 404 page required by Next.js App Router
 */
import Link from 'next/link';

export default function NotFound() {
  /* Fills the space between navbar and footer; a full-screen minimum pushed the link under the fold on phones. */
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center text-text-primary font-mono">
      <h1 className="text-6xl font-bold text-accent-red mb-4">404</h1>
      <p className="text-text-secondary mb-6">Page not found</p>
      <Link href="/" className="inline-flex min-h-[44px] items-center px-4 text-accent-green hover:underline">
        Return home
      </Link>
    </div>
  );
}
