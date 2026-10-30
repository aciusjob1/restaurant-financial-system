'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import { defaultRange } from '@/lib/reports';
import { useT } from '@/lib/i18n/LanguageContext';

export function FilterBar({ children, showDates = true }: { children?: ReactNode; showDates?: boolean }) {
  const router = useRouter();
  const { t } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const def = defaultRange();

  const from = searchParams.get('from') ?? def.from;
  const to = searchParams.get('to') ?? def.to;

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      router.push(pathname + '?' + next.toString());
    },
    [router, pathname, searchParams]
  );

  return (
    <form
      className='rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3'
      onSubmit={(e) => e.preventDefault()}
    >
      {showDates && (
        <>
          <label className='flex flex-col'>
            <span className='text-xs uppercase tracking-wide text-slate-500 mb-1'>{t('reports.filter.from')}</span>
            <input
              type='date'
              value={from}
              onChange={(e) => updateParam('from', e.target.value)}
              className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
            />
          </label>
          <label className='flex flex-col'>
            <span className='text-xs uppercase tracking-wide text-slate-500 mb-1'>{t('reports.filter.to')}</span>
            <input
              type='date'
              value={to}
              onChange={(e) => updateParam('to', e.target.value)}
              className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
            />
          </label>
        </>
      )}
      {children}
    </form>
  );
}
