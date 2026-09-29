'use client';

import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type Domain = { href: string; titleKey: keyof Dict; descriptionKey: keyof Dict };

const DOMAINS: Domain[] = [
  { href: '/ops/cash',       titleKey: 'ops.domains.cash.title',       descriptionKey: 'ops.domains.cash.description' },
  { href: '/ops/sales',      titleKey: 'ops.domains.sales.title',      descriptionKey: 'ops.domains.sales.description' },
  { href: '/ops/purchasing', titleKey: 'ops.domains.purchasing.title', descriptionKey: 'ops.domains.purchasing.description' },
  { href: '/ops/expenses',   titleKey: 'ops.domains.expenses.title',   descriptionKey: 'ops.domains.expenses.description' },
  { href: '/ops/salaries',   titleKey: 'ops.domains.salaries.title',   descriptionKey: 'ops.domains.salaries.description' },
  { href: '/ops/staff',      titleKey: 'ops.domains.staff.title',      descriptionKey: 'ops.domains.staff.description' },
];

export default function OpsHubPage() {
  const { t } = useT();
  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.header.title')}
        subtitle={t('ops.header.subtitle')}
      />
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {DOMAINS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className='rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm'
          >
            <h2 className='text-base font-medium text-slate-900'>{t(d.titleKey)}</h2>
            <p className='mt-2 text-sm text-slate-600'>{t(d.descriptionKey)}</p>
          </Link>
        ))}
      </div>
    </OpsShell>
  );
}
