'use client';

import Link from 'next/link';
import { ReportShell } from '@/components/reports/ReportShell';
import { ReportHeader } from '@/components/reports/StateViews';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type ReportCard = { href: string; titleKey: keyof Dict; descriptionKey: keyof Dict };

const REPORTS: ReportCard[] = [
  {
    href: '/reports/daily-sales',
    titleKey: 'reports.cards.dailySales.title',
    descriptionKey: 'reports.cards.dailySales.description',
  },
  {
    href: '/reports/reconciliations',
    titleKey: 'reports.cards.reconciliations.title',
    descriptionKey: 'reports.cards.reconciliations.description',
  },
  {
    href: '/reports/handovers',
    titleKey: 'reports.cards.handovers.title',
    descriptionKey: 'reports.cards.handovers.description',
  },
  {
    href: '/reports/expenses',
    titleKey: 'reports.cards.expenses.title',
    descriptionKey: 'reports.cards.expenses.description',
  },
  {
    href: '/reports/supplier-balances',
    titleKey: 'reports.cards.supplierBalances.title',
    descriptionKey: 'reports.cards.supplierBalances.description',
  },
  {
    href: '/reports/sales-vs-pos',
    titleKey: 'reports.cards.salesVsPos.title',
    descriptionKey: 'reports.cards.salesVsPos.description',
  },
  {
    href: '/reports/stock-movements',
    titleKey: 'reports.cards.stockMovements.title',
    descriptionKey: 'reports.cards.stockMovements.description',
  },
];

export default function ReportsLandingPage() {
  const { t } = useT();
  return (
    <ReportShell>
      <ReportHeader
        title={t('reports.header.title')}
        subtitle={t('reports.header.subtitle')}
      />

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className='rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm'
          >
            <h2 className='text-base font-medium text-slate-900'>{t(r.titleKey)}</h2>
            <p className='mt-2 text-sm text-slate-600'>{t(r.descriptionKey)}</p>
          </Link>
        ))}
      </div>
    </ReportShell>
  );
}
