/**
 * Purpose: React context provider for i18n — manages locale state and translation lookup
 */
'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Locale } from '@/lib/i18n';
import { en, zh } from '@/lib/i18n';

const dictionaries = { en, zh } as const;
const LOCALE_KEY = 'at-lang';

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'zh';
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render must agree (hydration), so start on 'en' and
  // apply the persisted choice once mounted.
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (isLocale(stored)) setLocaleState(stored);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* storage unavailable — the choice lasts for this page view */
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      const dict = dictionaries[locale] as Record<string, string>;
      return dict[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}
