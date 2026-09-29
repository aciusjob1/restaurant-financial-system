'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '@/lib/api';
import { dictionaries, isLang, type Dict, type Lang } from './dictionaries';

const COOKIE_NAME = 'rfs_lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type Ctx = {
  lang: Lang;
  t: (key: keyof Dict) => string;
  tError: (code: string, fallback: string) => string;
  setLang: (l: Lang) => void;
};

const LanguageCtx = createContext<Ctx | null>(null);

function readCookie(): Lang | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\\s*)rfs_lang=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : '';
  return isLang(v) ? v : null;
}

function writeCookie(l: Lang) {
  if (typeof document === 'undefined') return;
  document.cookie = COOKIE_NAME + '=' + l + '; path=/; max-age=' + COOKIE_MAX_AGE + '; samesite=lax';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const c = readCookie();
    if (c) {
      setLangState(c);
      return;
    }
    // No cookie: try the logged-in user preference, if any.
    apiFetch<{ success: true; user: { language: string | null } }>('/api/v1/auth/me')
      .then((res) => {
        const u = res.user.language;
        if (isLang(u)) {
          setLangState(u);
          writeCookie(u);
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeCookie(l);
    // Best-effort persist to backend. Will 401 when not logged in.
    apiFetch('/api/v1/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ language: l }),
    }).catch(() => {});
  }, []);

  const t = useCallback(
    (key: keyof Dict): string => {
      const d = dictionaries[lang] as Record<string, string>;
      const fallback = dictionaries.en as Record<string, string>;
      return d[key as string] ?? fallback[key as string] ?? String(key);
    },
    [lang]
  );

  const tError = useCallback(
    (code: string, fallback: string): string => {
      const key = 'errors.' + code;
      const d = dictionaries[lang] as Record<string, string>;
      const fallbackDict = dictionaries.en as Record<string, string>;
      return d[key] ?? fallbackDict[key] ?? fallback;
    },
    [lang]
  );

  return (
    <LanguageCtx.Provider value={{ lang, t, tError, setLang }}>
      {children}
    </LanguageCtx.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageCtx);
  if (!ctx) throw new Error('useT must be used inside LanguageProvider');
  return ctx;
}
