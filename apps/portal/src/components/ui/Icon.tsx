import { cn } from '@/lib/utils/cn';

// Must match symbol IDs in /public/icons.svg (id="icon-{name}")
export type IconName =
  | 'activity'
  | 'alert-triangle'
  | 'arrow-right'
  | 'arrow-up-down'
  | 'award'
  | 'bar-chart'
  | 'bell'
  | 'bell-ring'
  | 'book-open'
  | 'bot'
  | 'calendar-days'
  | 'calendar'
  | 'check'
  | 'check-circle'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevrons-down'
  | 'clock'
  | 'coins'
  | 'compass'
  | 'copy'
  | 'cpu'
  | 'crown'
  | 'download'
  | 'edit-3'
  | 'eye'
  | 'file'
  | 'file-text'
  | 'flame'
  | 'folder'
  | 'gauge'
  | 'github'
  | 'globe'
  | 'hard-drive'
  | 'hash'
  | 'heart'
  | 'home'
  | 'info'
  | 'key'
  | 'layers'
  | 'link'
  | 'loader'
  | 'lock'
  | 'mail'
  | 'map-pin'
  | 'menu'
  | 'message-circle'
  | 'message-square'
  | 'minus'
  | 'monitor'
  | 'moon'
  | 'network'
  | 'package'
  | 'palette'
  | 'play'
  | 'plus'
  | 'power'
  | 'radio'
  | 'rocket'
  | 'search'
  | 'send'
  | 'server'
  | 'settings'
  | 'share-2'
  | 'shield'
  | 'shield-check'
  | 'shuffle'
  | 'slash'
  | 'sparkles'
  | 'star'
  | 'sun'
  | 'terminal'
  | 'trending-up'
  | 'trophy'
  | 'twitter'
  | 'upload'
  | 'upload-cloud'
  | 'user'
  | 'users'
  | 'wallet'
  | 'wifi'
  | 'wifi-off'
  | 'wind'
  | 'x'
  | 'x-close'
  | 'x-twitter'
  | 'zap';

const sizeMap = {
  sm: 'h-4 w-4',
  default: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
} as const;

interface IconProps {
  name: IconName;
  size?: keyof typeof sizeMap;
  className?: string;
  'aria-label'?: string;
}

export function Icon({ name, size = 'default', className, 'aria-label': ariaLabel }: IconProps) {
  return (
    <svg
      className={cn(sizeMap[size], 'shrink-0', className)}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      <use href={`/icons.svg?v=6#icon-${name}`} />
    </svg>
  );
}
