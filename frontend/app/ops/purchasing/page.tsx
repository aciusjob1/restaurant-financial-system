'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { apiFetch } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { REPORT_PATHS, type SupplierBalancesResponse } from '@/lib/reports';
import { useT } from '@/lib/i18n/LanguageContext';

type Supplier = { id: string; isActive: boolean };

export default function PurchasingHubPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [activeSuppliers, setActiveSuppliers] = useState(0);
  const [balance, setBalance] = useState('0.00');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [supRes, balRes] = await Promise.all([
          apiFetch<{ success: true; suppliers: Supplier[] }>(OPS_PATHS.suppliers),
          apiFetch<SupplierBalancesResponse>(REPORT_PATHS.supplierBalances),
        ]);
        if (cancelled) return;
        setActiveSuppliers(supRes.suppliers.filter((s) => s.isActive).length);
        setBalance(balRes.totals.balance);
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ops = [
    { href: '/ops/suppliers',            label: t('ops.purchasing.op.suppliers') },
    { href: '/ops/purchase-invoices',    label: t('ops.purchasing.op.invoices') },
    { href: '/ops/supplier-payments',    label: t('ops.purchasing.op.payments') },
    { href: '/ops/materials',            label: t('ops.purchasing.op.materials') },
    { href: '/ops/material-categories',  label: t('ops.purchasing.op.materialCategories') },
    { href: '/ops/stock-movements',      label: t('ops.purchasing.op.stockMovements') },
  ];

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.purchasing.title')}
        subtitle={t('ops.purchasing.subtitle')}
      />

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.status.heading')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.purchasing.stat.suppliers')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : activeSuppliers}
            </div>
          </div>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.purchasing.stat.balance')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : balance}
            </div>
          </div>
        </div>
      </section>

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.next.heading')}
        </h2>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700'>
          {loading ? t('ops.hub.loading') : t('ops.purchasing.next.reviewBalances')}
        </div>
      </section>

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.operations.heading')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {ops.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className='rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm'
            >
              <div className='text-sm font-medium text-slate-900'>{o.label}</div>
            </Link>
          ))}
        </div>
      </section>
    </OpsShell>
  );
}
