/**
 * Purpose: Privacy policy — ultra-short, privacy-first. We collect nothing.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy — StonkAgents',
  description: 'StonkAgents privacy policy. We collect nothing.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16">
      <article className="max-w-lg w-full font-mono">
        <h1 className="text-[var(--text-3xl)] font-bold text-text-primary mb-8">Privacy Policy</h1>

        <div className="space-y-6 text-[var(--text-base)] text-text-secondary leading-relaxed">
          <p>
            <strong className="text-text-primary">TL;DR:</strong> We don&apos;t collect anything. Period.
          </p>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">What We Collect</h2>
            <p>Nothing. Zero. Nada. No cookies, no analytics, no tracking pixels, no fingerprinting.</p>
          </section>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">Local Storage</h2>
            <p>
              Your game scores and preferences are stored in your browser&apos;s localStorage. This data never leaves your device. We
              cannot see it. We don&apos;t want to.
            </p>
          </section>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">Third Parties</h2>
            <p>
              When you click &quot;Share on X,&quot; you interact with X (Twitter) directly. Their privacy policy applies to that
              interaction, not ours.
            </p>
          </section>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">Contact</h2>
            <p>
              Questions? Find us at{' '}
              <a
                data-testid="privacy-x-link"
                href="https://x.com/stonkagents"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-green hover:underline"
              >
                @stonkagents
              </a>{' '}
              on X.
            </p>
          </section>
        </div>

        <a
          data-testid="privacy-back-link"
          href="/"
          className="inline-block mt-12 text-[var(--text-sm)] text-accent-green hover:underline"
        >
          ← Back to the Network
        </a>
      </article>
    </main>
  );
}
