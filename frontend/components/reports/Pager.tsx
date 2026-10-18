'use client';

import { useT } from '@/lib/i18n/LanguageContext';

export function Pager({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (nextOffset: number) => void;
}) {
  const { t } = useT();
  if (total <= limit) return null;

  const first = total === 0 ? 0 : offset + 1;
  const last  = Math.min(offset + limit, total);
  const prevDisabled = offset <= 0;
  const nextDisabled = offset + limit >= total;

  return (
    <div className='flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm'>
      <span className='text-slate-600'>
        {t('reports.pager.range')
          .replace('{first}', String(first))
          .replace('{last}', String(last))
          .replace('{total}', String(total))}
      </span>
      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={prevDisabled}
          className='rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
        >
          {t('reports.pager.prev')}
        </button>
        <button
          type='button'
          onClick={() => onChange(offset + limit)}
          disabled={nextDisabled}
          className='rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
        >
          {t('reports.pager.next')}
        </button>
      </div>
    </div>
  );
}