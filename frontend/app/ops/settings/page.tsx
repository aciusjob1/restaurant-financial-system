'use client';

import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type Card = { href: string; titleKey: keyof Dict; descKey: keyof Dict };

export default function SettingsPage() {
  const { t } = useT();
  const cards: Card[] = [
    {
      href: '/ops/settings/restaurant',
      titleKey: 'ops.settings.restaurant.title',
      descKey: 'ops.settings.restaurant.subtitle',
    },
    {
      href: '/ops/settings/backup',
      titleKey: 'ops.settings.backup.title',
      descKey: 'ops.settings.backup.subtitle',
    },
    {
      href: '/ops/settings/positions',
      titleKey: 'ops.positions.title',
      descKey: 'ops.positions.subtitle',
    },
    {
      href: '/ops/settings/expense-categories',
      titleKey: 'ops.expenseCategories.title',
      descKey: 'ops.expenseCategories.subtitle',
    },
    {
      href: '/ops/settings/material-categories',
      titleKey: 'ops.materialCategories.title',
      descKey: 'ops.materialCategories.subtitle',
    },
  ];
  return (
    <OpsShell>
      <OpsHeader title={t('ops.settings.title')} subtitle={t('ops.settings.subtitle')} />
      <section className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className='rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm'
          >
            <div className='text-sm font-medium text-slate-900'>{t(c.titleKey)}</div>
            <div className='text-xs text-slate-500 mt-1'>{t(c.descKey)}</div>
          </Link>
        ))}
      </section>
    </OpsShell>
  );
}
