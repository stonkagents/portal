/**
 * Purpose: Reusable SVG crab mascot with online/offline variants and animation support
 */
import { cn } from '@/lib/utils/cn';

type ClawVariant = 'online' | 'offline';
type ClawAnimation = 'none' | 'spin' | 'breathe' | 'bounce' | 'scuttle' | 'glasses-glint';

const sizeMap = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
  '2xl': 'w-32 h-32',
} as const;

const animationMap: Record<ClawAnimation, string> = {
  none: '',
  spin: 'animate-claw-spin',
  breathe: 'animate-neon-breathe',
  bounce: 'animate-claw-bounce',
  scuttle: 'animate-scuttle',
  'glasses-glint': 'animate-glasses-glint',
};

interface ClawMascotProps {
  variant?: ClawVariant;
  animation?: ClawAnimation;
  size?: keyof typeof sizeMap;
  className?: string;
}

function ClawOnline() {
  return (
    <g>
      <path fill="#FF4D4D" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
      <path fill="#FF4D4D" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
      <path fill="#FF4D4D" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
      <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
      <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
      <rect fill="var(--color-bg-primary, #080a0f)" x="34" y="60" width="12" height="6" />
      <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
      <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
      <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
      <rect fill="var(--color-bg-primary, #080a0f)" x="74" y="60" width="12" height="6" />
    </g>
  );
}

function ClawOffline() {
  return (
    <g>
      <path fill="#CC4040" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
      <path fill="#CC4040" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
      <path fill="#CC4040" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
      <circle fill="var(--color-bg-primary, #080a0f)" cx="42" cy="58" r="7" />
      <circle fill="var(--color-bg-primary, #080a0f)" cx="78" cy="58" r="7" />
      <circle fill="#CC4040" cx="40" cy="56" r="2" opacity="0.4" />
      <circle fill="#CC4040" cx="76" cy="56" r="2" opacity="0.4" />
    </g>
  );
}

export function ClawMascot({ variant = 'online', animation = 'none', size = 'md', className }: ClawMascotProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(sizeMap[size], animationMap[animation], className)}
      aria-hidden="true"
    >
      {variant === 'online' ? <ClawOnline /> : <ClawOffline />}
    </svg>
  );
}
