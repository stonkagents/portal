/**
 * Purpose: Inline SVG Claw mascot icons — standard (glasses), thug (cigar + smoke),
 *          and offline. Used in chat messages and throughout the prelaunch page.
 *          Three variants from the design system: sections 14, 15, 16.
 */

export type ClawVariant = 'standard' | 'glasses' | 'thug';

interface ClawIconProps {
  variant?: ClawVariant;
  size?: number;
  className?: string;
  animate?: 'breathe' | 'spin' | 'bounce' | 'none';
}

/** Standard Claw — red body + neon green pixel sunglasses (#claw-icon) */
function StandardClaw() {
  return (
    <g>
      {/* Left claw */}
      <path fill="#FF4D4D" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
      {/* Right claw */}
      <path fill="#FF4D4D" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
      {/* Head dome */}
      <path fill="#FF4D4D" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
      {/* Pixel sunglasses */}
      <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
      <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
      <rect fill="#080a0f" x="34" y="60" width="12" height="6" />
      <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
      <rect fill="#080a0f" x="74" y="60" width="12" height="6" />
    </g>
  );
}

/** Thug Claw — pixel sunglasses + cigar with smoke wisps + smirk (#claw-thug-icon) */
function ThugClaw() {
  return (
    <g>
      {/* Claws */}
      <path fill="#FF4D4D" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
      <path fill="#FF4D4D" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
      {/* Head dome */}
      <path fill="#FF4D4D" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
      {/* Pixel Sunglasses — neon green */}
      <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
      <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
      <rect fill="#080a0f" x="34" y="60" width="12" height="6" />
      <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
      <rect fill="#080a0f" x="74" y="60" width="12" height="6" />
      {/* Smirk */}
      <path fill="none" stroke="#CC3333" strokeWidth="2" strokeLinecap="round" d="M48 78 Q60 84, 74 78" />
      <ellipse fill="#080a0f" cx="74" cy="78" rx="3" ry="2" />
      {/* Cigar */}
      <g transform="rotate(-15, 74, 78)">
        <rect fill="#8B7355" x="74" y="76" width="32" height="5" rx="2" />
        <rect fill="#cc9944" x="80" y="75.5" width="4" height="6" rx="0.5" />
        <rect fill="#aa7722" x="81" y="76" width="2" height="5" />
        <rect fill="#5a4030" x="72" y="75.5" width="5" height="6" rx="1" />
        <ellipse className="claw-ember" fill="#ff6b35" cx="106" cy="78.5" rx="2.5" ry="2.5" />
        <rect fill="#888" x="103" y="76.5" width="3" height="4" rx="0.5" />
        {/* Smoke wisps */}
        <path
          className="claw-smoke"
          fill="none"
          stroke="rgba(200,200,200,0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M107 74 Q110 69, 107 64 Q104 59, 108 54"
        />
        <path
          className="claw-smoke claw-smoke-2"
          fill="none"
          stroke="rgba(200,200,200,0.4)"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M109 75 Q112 70, 110 65 Q108 60, 111 55"
        />
        <path
          className="claw-smoke claw-smoke-3"
          fill="none"
          stroke="rgba(200,200,200,0.3)"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M105 73 Q108 68, 106 63 Q104 58, 107 53"
        />
      </g>
    </g>
  );
}

/** Glasses Claw — same SVG as standard but with the green neon glow effect */
function GlassesClaw() {
  return (
    <g>
      {/* Claws */}
      <path fill="#FF4D4D" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
      <path fill="#FF4D4D" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
      {/* Head dome */}
      <path fill="#FF4D4D" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
      {/* Pixel sunglasses — with glint highlight */}
      <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
      <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
      <rect fill="#080a0f" x="34" y="60" width="12" height="6" />
      <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
      <rect fill="#080a0f" x="74" y="60" width="12" height="6" />
      {/* Glint on glasses */}
      <rect fill="rgba(255,255,255,0.6)" x="30" y="56" width="4" height="4" rx="1" className="claw-glint" />
      <rect fill="rgba(255,255,255,0.6)" x="70" y="56" width="4" height="4" rx="1" className="claw-glint" />
    </g>
  );
}

const ANIMATION_CLASS: Record<string, string> = {
  breathe: 'animate-claw-breathe',
  spin: 'animate-claw-spin',
  bounce: 'animate-claw-bounce',
  none: '',
};

export function ClawIcon({ variant = 'standard', size = 20, className = '', animate = 'none' }: ClawIconProps) {
  const animClass = ANIMATION_CLASS[animate] || '';
  const filter =
    variant === 'glasses'
      ? 'drop-shadow(0 0 4px rgba(0,255,0,0.5))'
      : variant === 'thug'
        ? 'drop-shadow(0 0 4px rgba(255,107,53,0.4))'
        : 'drop-shadow(0 0 3px rgba(255,77,77,0.3))';

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`inline-block align-middle ${animClass} ${className}`}
      style={{ filter }}
      aria-hidden="true"
    >
      {variant === 'thug' ? <ThugClaw /> : variant === 'glasses' ? <GlassesClaw /> : <StandardClaw />}
    </svg>
  );
}
