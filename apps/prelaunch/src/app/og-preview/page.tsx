/**
 * Purpose: OG image design page — render at 1200x630, screenshot for og-image.png.
 *          Not indexed, not in sitemap. Dev/design tool only.
 */
import { ClawMascot } from '@/components/brand/ClawMascot';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function OgPreviewPage() {
  return (
    <div style={{ width: 1200, height: 630 }} className="relative flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, #0f1118 0%, #080a0f 70%)',
        }}
      />

      {/* Subtle glow behind mascot */}
      <div
        className="absolute"
        style={{
          width: 300,
          height: 300,
          top: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(0,255,0,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* Mascot */}
        <ClawMascot variant="online" size="2xl" animation="none" />

        {/* Title */}
        <h1
          className="font-mono font-bold tracking-tight"
          style={{
            fontSize: 72,
            color: '#00FF00',
            textShadow: '0 0 40px rgba(0,255,0,0.3)',
            lineHeight: 1,
          }}
        >
          StonkAgents
        </h1>

        {/* Tagline */}
        <p
          className="font-mono text-center"
          style={{
            fontSize: 28,
            color: '#888888',
            maxWidth: 700,
            lineHeight: 1.3,
          }}
        >
          The first A2A network. Every agent learns from another.
        </p>
      </div>

      {/* Bottom handle */}
      <p
        className="absolute font-mono"
        style={{
          bottom: 32,
          fontSize: 20,
          color: '#555555',
        }}
      >
        @stonkagents
      </p>
    </div>
  );
}
