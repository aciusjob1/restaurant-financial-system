'use client';

import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type Domain = { href: string; titleKey: keyof Dict; descriptionKey: keyof Dict };

const DOMAINS: Domain[] = [
  { href: '/ops/materials',            titleKey: 'ops.domains.materials.title',            descriptionKey: 'ops.domains.materials.description' },
  { href: '/ops/material-categories',  titleKey: 'ops.domains.materialCategories.title',   descriptionKey: 'ops.domains.materialCategories.description' },
  { href: '/ops/expense-categories',   titleKey: 'ops.domains.expenseCategories.title',    descriptionKey: 'ops.domains.expenseCategories.description' },
  { href: '/ops/suppliers',            titleKey: 'ops.domains.suppliers.title',            descriptionKey: 'ops.domains.suppliers.description' },
  { href: '/ops/employees',            titleKey: 'ops.domains.employees.title',            descriptionKey: 'ops.domains.employees.description' },
  { href: '/ops/positions',            titleKey: 'ops.domains.positions.title',            descriptionKey: 'ops.domains.positions.description' },
  { href: '/ops/purchase-invoices',    titleKey: 'ops.domains.purchaseInvoices.title',     descriptionKey: 'ops.domains.purchaseInvoices.description' },
  { href: '/ops/supplier-payments',    titleKey: 'ops.domains.supplierPayments.title',     descriptionKey: 'ops.domains.supplierPayments.description' },
  { href: '/ops/stock-movements',      titleKey: 'ops.domains.stockMovements.title',       descriptionKey: 'ops.domains.stockMovements.description' },
  { href: '/ops/sales',                titleKey: 'ops.domains.sales.title',                descriptionKey: 'ops.domains.sales.description' },
  { href: '/ops/shifts',               titleKey: 'ops.domains.shifts.title',               descriptionKey: 'ops.domains.shifts.description' },
  { href: '/ops/reconciliations',      titleKey: 'ops.domains.reconciliations.title',      descriptionKey: 'ops.domains.reconciliations.description' },
  { href: '/ops/collections',          titleKey: 'ops.domains.collections.title',          descriptionKey: 'ops.domains.collections.description' },
  { href: '/ops/handovers',            titleKey: 'ops.domains.handovers.title',            descriptionKey: 'ops.domains.handovers.description' },
  { href: '/ops/expenses',             titleKey: 'ops.domains.expenses.title',             descriptionKey: 'ops.domains.expenses.description' },
  { href: '/ops/salaries',             titleKey: 'ops.domains.salaries.title',             descriptionKey: 'ops.domains.salaries.description' },
  { href: '/ops/daily-closing',        titleKey: 'ops.domains.dailyClosing.title',         descriptionKey: 'ops.domains.dailyClosing.description' },
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
