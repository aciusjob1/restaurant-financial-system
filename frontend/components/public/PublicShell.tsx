'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { LanguagePicker } from '@/lib/i18n/LanguagePicker';

const SIDEBAR_ROLES = new Set(['OWNER', 'MANAGER']);

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const year = new Date().getFullYear();
  const [checked, setChecked] = useState(false);
  const [sidebarUser, setSidebarUser] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ success: true; user: { role: string } }>('/api/v1/auth/me')
      .then((res) => {
        if (!cancelled) setSidebarUser(SIDEBAR_ROLES.has(res.user.role));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className='flex min-h-screen flex-col'>
      <header className='border-b border-slate-200 bg-white'>
        <div className='mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-5 py-3'>
          <Link href='/about' className='flex items-center gap-2'>
            <span className='grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white'>
              R
            </span>
            <span className='text-sm font-semibold text-slate-800'>{t('public.brand')}</span>
          </Link>
          <div className='flex items-center gap-3'>
            <LanguagePicker />
            {!checked ? (
              <span className='inline-block h-[30px] w-24' aria-hidden='true' />
            ) : sidebarUser ? (
              <Link
                href='/dashboard'
                className='rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
              >
                {t('public.backToDashboard')}
              </Link>
            ) : (
              <Link
                href='/login'
                className='rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
              >
                {t('public.signIn')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className='mx-auto w-full max-w-4xl flex-1 px-5 py-8'>{children}</main>

      <footer className='border-t border-slate-200 bg-white'>
        <div className='mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-slate-500'>
          <span>
            &copy; {year} Acius Job Missingo &middot; {t('public.brand')}
          </span>
          <nav className='flex flex-wrap gap-4'>
            <Link href='/about' className='hover:text-slate-900'>
              {t('public.footer.about')}
            </Link>
            <Link href='/policies' className='hover:text-slate-900'>
              {t('public.footer.policies')}
            </Link>
            <Link href='/policies/cookies' className='hover:text-slate-900'>
              {t('public.footer.cookies')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
