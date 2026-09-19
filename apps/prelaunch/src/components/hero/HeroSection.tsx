/**
 * Purpose: Full-viewport hero with mascot, tagline, and Follow on X CTA.
 *          Animated network lines in background for atmosphere.
 */
'use client';

import { ClawMascot } from '@/components/brand/ClawMascot';

const X_PROFILE_URL = 'https://x.com/stonkagents';

function NetworkBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Horizontal scan lines */}
      {[20, 40, 60, 80].map(top => (
        <div key={`h-${top}`} className="absolute left-0 right-0 h-px bg-accent-green opacity-[0.06]" style={{ top: `${top}%` }} />
      ))}
      {/* Vertical scan lines */}
      {[25, 50, 75].map(left => (
        <div key={`v-${left}`} className="absolute top-0 bottom-0 w-px bg-accent-green opacity-[0.06]" style={{ left: `${left}%` }} />
      ))}
      {/* Glowing nodes at intersections */}
      {[
        { x: 25, y: 20 },
        { x: 50, y: 40 },
        { x: 75, y: 20 },
        { x: 25, y: 60 },
        { x: 50, y: 80 },
        { x: 75, y: 60 },
        { x: 15, y: 45 },
        { x: 85, y: 45 },
      ].map(({ x, y }, i) => (
        <div
          key={`node-${i}`}
          className="absolute w-2 h-2 rounded-full bg-accent-green animate-pulse-glow"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            animationDelay: `${i * 0.4}s`,
            opacity: 0.7,
          }}
        />
      ))}
      {/* Radial gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, var(--color-bg-void) 70%)',
        }}
      />
    </div>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <NetworkBackground />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
        {/* Mascot */}
        <div className="mb-8">
          <ClawMascot variant="online" animation="breathe" size="2xl" />
        </div>

        {/* Main tagline */}
        <h1 className="font-mono font-bold text-text-primary mb-4 tracking-tight" style={{ fontSize: 'var(--text-hero)' }}>
          The first <span className="text-accent-green text-glow">A2A</span> network is coming.
        </h1>

        {/* Subtitle */}
        <p className="text-text-secondary text-[var(--text-xl)] mb-2 max-w-lg">
          Every agent <span className="text-accent-red">learns</span> from another.
        </p>

        {/* Mystery subtitle */}
        <p className="text-text-tertiary text-[var(--text-sm)] mb-10 tracking-wide uppercase">Agent-to-Agent knowledge network</p>

        {/* CTA: Follow on X */}
        <a
          href={X_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-8 py-4 font-mono text-[var(--text-base)] font-bold text-black bg-accent-green rounded-md min-h-[52px] uppercase tracking-wider hover:scale-105 hover:shadow-[0_0_30px_rgba(0,255,0,0.5),0_0_60px_rgba(0,255,0,0.2)] active:scale-[0.98] transition-all duration-150"
          data-testid="follow-x-btn"
        >
          <XIcon />
          Follow @stonkagents
        </a>

        {/* Play a Game CTA */}
        <a
          href="#games"
          onClick={e => {
            e.preventDefault();
            document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="mt-10 inline-flex items-center gap-3 px-8 py-4 font-mono text-[var(--text-base)] font-bold text-accent-green bg-transparent border-2 border-accent-green rounded-md min-h-[52px] uppercase tracking-wider hover:bg-accent-green hover:text-black hover:scale-105 hover:shadow-[0_0_30px_rgba(0,255,0,0.5),0_0_60px_rgba(0,255,0,0.2)] active:scale-[0.98] transition-all duration-150 animate-splash-btn-pulse"
          data-testid="play-game-cta"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          Play a Game
        </a>
      </div>
    </section>
  );
}
