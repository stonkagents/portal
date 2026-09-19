/**
 * Purpose: Lonely crab mascot (no glasses) for splash screen — extracted from the portal's SplashScreen
 */

interface LonelyCrabProps {
  className?: string;
}

export function LonelyCrab({ className = 'w-[180px] h-[180px]' }: LonelyCrabProps) {
  return (
    <svg className={className} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g>
        <path fill="#FF4D4D" d="M24 50 C20 42, 14 36, 10 30 C8 26, 10 20, 16 20 C20 20, 22 24, 22 28 C22 32, 26 36, 30 42 Z" />
        <path fill="#FF4D4D" d="M96 50 C100 42, 106 36, 110 30 C112 26, 110 20, 104 20 C100 20, 98 24, 98 28 C98 32, 94 36, 90 42 Z" />
        <path fill="#FF4D4D" d="M20 58 C20 40, 32 32, 60 32 C88 32, 100 40, 100 58 C100 78, 88 90, 60 90 C32 90, 20 78, 20 58 Z" />
      </g>
    </svg>
  );
}
