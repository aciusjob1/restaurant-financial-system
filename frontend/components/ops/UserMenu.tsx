'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Props = { fullName: string; role: string };

export function UserMenu({ fullName, role }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch { /* fall through */ }
    router.push('/login');
  }

  return (
    <div ref={wrapRef} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        aria-label={t('userMenu.aria')}
        aria-expanded={open}
        className='flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100'
      >
        <div className='w-7 h-7 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0'>
          {fullName.slice(0, 1).toUpperCase()}
        </div>
        <div className='hidden sm:flex flex-col items-start leading-tight min-w-0'>
          <span className='text-xs font-medium text-slate-900 max-w-[10rem] truncate'>{fullName}</span>
          <span className='text-[10px] text-slate-500'>{role}</span>
        </div>
      </button>
      {open && (
        <div className='absolute right-0 mt-1 min-w-[12rem] rounded-xl border border-slate-200 bg-white shadow-lg z-20 py-1'>
          <Link
            href='/ops/account'
            onClick={() => setOpen(false)}
            className='block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'
          >
            {t('userMenu.myAccount')}
          </Link>
          <button
            type='button'
            onClick={handleSignOut}
            disabled={signingOut}
            className='block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
          >
            {signingOut ? t('userMenu.signingOut') : t('userMenu.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
