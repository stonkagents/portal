/**
 * Purpose: Share score on X button — opens pre-filled tweet intent tagging @stonkagents.
 */
import { SITE_URL } from '@/lib/site';

const GAME_NAMES: Record<string, string> = {
  runner: 'Find Your Agent',
  swarm: 'Sync the Swarm',
  racer: 'Agent Racing',
};

interface ShareOnXProps {
  score: number;
  game: string;
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function ShareOnX({ score, game }: ShareOnXProps) {
  const gameName = GAME_NAMES[game] ?? game;
  const text = `I scored ${score} in ${gameName} on @stonkagents\n\nThe Network is coming. Every agent learns from another.\n\n${SITE_URL}`;
  const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;

  return (
    <a
      data-testid="share-x-btn"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-5 py-2.5 font-mono text-[var(--text-sm)] font-bold text-black bg-accent-green rounded-md min-h-[44px] uppercase tracking-wider hover:scale-105 hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] active:scale-[0.98] transition-all duration-150"
    >
      <XIcon />
      Share on X
    </a>
  );
}
