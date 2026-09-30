'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/LanguageContext';

export function SecondarySurfaceBanner() {
  const { t } = useT();
  return (
    <div className='rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap'>
      <span>{t('ops.cashFlow.secondary.banner')}</span>
      <Link
        href='/ops/cash'
        className='text-blue-800 underline hover:text-blue-950 whitespace-nowrap'
      >
        {t('ops.cashFlow.secondary.link')}
      </Link>
    </div>
  );
}
