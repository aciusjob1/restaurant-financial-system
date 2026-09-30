'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type Props = {
  messageKey?: keyof Dict;
  targetHref?: string;
  targetLabelKey?: keyof Dict;
};

export function SecondarySurfaceBanner({
  messageKey = 'ops.cashFlow.secondary.banner',
  targetHref = '/ops/cash',
  targetLabelKey = 'ops.cashFlow.secondary.link',
}: Props = {}) {
  const { t } = useT();
  return (
    <div className='rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap'>
      <span>{t(messageKey)}</span>
      <Link
        href={targetHref}
        className='text-blue-800 underline hover:text-blue-950 whitespace-nowrap'
      >
        {t(targetLabelKey)}
      </Link>
    </div>
  );
}
