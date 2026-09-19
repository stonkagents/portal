/**
 * One project link on the launch form: the platform's mark in its brand colour,
 * a field that takes a full link or just a handle, and the link it settles on.
 *
 * Typing is free-form. On blur (or Enter) the value is normalised to one
 * canonical URL and written back into the form, so the metadata never carries
 * "@handle" or "twitter.com". A wrong host or a malformed handle shows the
 * reason under the field and blocks the launch through the form schema.
 */
'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { normalizeProjectLink, type ProjectLinkPlatform } from '@/lib/launchlab/project-links';
import { controlClass, mono } from './FieldChrome';

interface ProjectLinkFieldProps {
  platform: ProjectLinkPlatform;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

const PLATFORMS: Record<ProjectLinkPlatform, { label: string; placeholder: string; color: string }> = {
  website: { label: 'Website', placeholder: 'yourproject.com', color: 'text-accent-green' },
  // X's mark is black on light and white on dark: follow the page's text colour.
  x: { label: 'X', placeholder: '@handle or x.com/handle', color: 'text-text-primary' },
  telegram: { label: 'Telegram', placeholder: '@username or t.me/username', color: 'text-[#26A5E4]' },
};

function PlatformMark({ platform, className }: { platform: ProjectLinkPlatform; className?: string }) {
  const common = { width: 16, height: 16, 'aria-hidden': true, className, fill: 'currentColor' } as const;
  switch (platform) {
    case 'x':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.5.5 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case 'website':
      return (
        <svg viewBox="0 0 24 24" {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
        </svg>
      );
  }
}

export function ProjectLinkField({ platform, value, error, onChange }: ProjectLinkFieldProps) {
  const id = useId();
  const meta = PLATFORMS[platform];
  const [touched, setTouched] = useState(false);
  const result = normalizeProjectLink(platform, value);
  const settled = result.ok && result.url !== '' && !result.changed;
  const preview = result.ok && result.url !== '' && result.changed ? result.url : null;
  const problem = error ?? (touched && !result.ok ? result.reason : undefined);

  const settle = () => {
    setTouched(true);
    if (result.ok && result.changed) onChange(result.url);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      settle();
    }
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid={`project-link-${platform}`}>
      <div className="group relative">
        <span
          className={cn(
            'pointer-events-none absolute left-0 top-0 flex h-11 w-11 items-center justify-center border-r border-border-default',
            'transition-colors duration-150 group-focus-within:border-accent-green',
            problem && 'border-accent-red',
            meta.color,
          )}
        >
          <PlatformMark platform={platform} />
        </span>
        <input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          placeholder={meta.placeholder}
          aria-label={meta.label}
          aria-invalid={problem ? 'true' : undefined}
          onChange={e => onChange(e.target.value)}
          onBlur={settle}
          onKeyDown={onKeyDown}
          className={cn(controlClass(Boolean(problem)), 'h-11 pl-14 pr-10')}
        />
        {settled && (
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-accent-green"
            aria-label="Link accepted"
            data-testid={`project-link-${platform}-ok`}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="m5 10.5 3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      {problem ? (
        <p className="text-xs leading-4 text-accent-red" role="alert">
          {problem}
        </p>
      ) : preview ? (
        <p className={cn(mono, 'truncate text-[11px] leading-4 text-text-tertiary')} data-testid={`project-link-${platform}-preview`}>
          → {preview}
        </p>
      ) : null}
    </div>
  );
}
