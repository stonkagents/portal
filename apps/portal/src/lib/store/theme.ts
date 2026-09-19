/**
 * Theme store — manages dark/light/system preference
 * Persists to localStorage, syncs with system prefers-color-scheme
 */
'use client';

import { useEffect, useState, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type LightVariant = 'default' | 'warm' | 'frost';

const STORAGE_KEY = 'stonkagents-theme';
const VARIANT_KEY = 'stonkagents-light-variant';

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark';
}

function getStoredVariant(): LightVariant {
  if (typeof window === 'undefined') return 'warm';
  return (localStorage.getItem(VARIANT_KEY) as LightVariant) || 'warm';
}

function applyTheme(theme: Theme, variant?: LightVariant) {
  if (typeof document === 'undefined') return;
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const el = document.documentElement;
  el.classList.toggle('dark', resolved === 'dark');
  el.classList.toggle('light', resolved === 'light');
  // Apply light variant class
  el.classList.remove('light-warm', 'light-frost');
  if (resolved === 'light') {
    const v = variant ?? getStoredVariant();
    if (v === 'warm') el.classList.add('light-warm');
    if (v === 'frost') el.classList.add('light-frost');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [lightVariant, setVariantState] = useState<LightVariant>('warm');

  useEffect(() => {
    const stored = getStoredTheme();
    const variant = getStoredVariant();
    setThemeState(stored);
    setVariantState(variant);
    applyTheme(stored, variant);

    // Listen for system theme changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
  }, []);

  const setLightVariant = useCallback((v: LightVariant) => {
    setVariantState(v);
    localStorage.setItem(VARIANT_KEY, v);
    applyTheme(getStoredTheme(), v);
  }, []);

  return { theme, setTheme, lightVariant, setLightVariant } as const;
}
