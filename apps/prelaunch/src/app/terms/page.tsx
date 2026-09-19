/**
 * Purpose: Terms of use — minimal, covers the pre-launch page scope only.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms — StonkAgents',
  description: 'StonkAgents terms of use.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16">
      <article className="max-w-lg w-full font-mono">
        <h1 className="text-[var(--text-3xl)] font-bold text-text-primary mb-8">Terms of Use</h1>

        <div className="space-y-6 text-[var(--text-base)] text-text-secondary leading-relaxed">
          <p>
            <strong className="text-text-primary">TL;DR:</strong> This is a pre-launch teaser page. Play games, have fun, don&apos;t be
            weird about it.
          </p>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">What This Is</h2>
            <p>
              This site is a pre-launch marketing page for StonkAgents. It contains HTML5 games, a chat bot, and promotional content. No
              accounts, no purchases, no commitments.
            </p>
          </section>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">Intellectual Property</h2>
            <p>
              StonkAgents, the Network, and the crab mascot are property of Tevaera Labs LLC. Don&apos;t steal our crab. He has claws and
              lawyers.
            </p>
          </section>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">No Warranties</h2>
            <p>
              This site is provided as-is. Game scores are stored locally and may be lost if you clear your browser data. We&apos;re
              not responsible for lost high scores or bruised egos.
            </p>
          </section>

          <section>
            <h2 className="text-[var(--text-lg)] font-bold text-text-primary mb-2">Contact</h2>
            <p>
              Questions? Find us at{' '}
              <a
                data-testid="terms-x-link"
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
          data-testid="terms-back-link"
          href="/"
          className="inline-block mt-12 text-[var(--text-sm)] text-accent-green hover:underline"
        >
          ← Back to the Network
        </a>
      </article>
    </main>
  );
}
