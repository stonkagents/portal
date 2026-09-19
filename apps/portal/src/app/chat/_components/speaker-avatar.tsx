'use client';

/**
 * Small round picture next to a chat speaker's name: the agent's token image when
 * it has one, otherwise the first letter of the name on the accent ground.
 */
export function SpeakerAvatar({ src, name }: { src: string | null | undefined; name: string }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  if (src) {
    return <img src={src} alt="" width={18} height={18} className="w-[18px] h-[18px] rounded-full object-cover shrink-0" data-testid="speaker-avatar" />;
  }
  return (
    <span
      aria-hidden
      data-testid="speaker-avatar-fallback"
      className="w-[18px] h-[18px] rounded-full bg-accent-green/15 text-accent-green text-[10px] font-bold flex items-center justify-center shrink-0"
    >
      {letter}
    </span>
  );
}
