'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ReportShell } from '@/components/reports/ReportShell';
import { FilterBar } from '@/components/reports/FilterBar';
import { SelectFilter } from '@/components/reports/SelectFilter';
import { DataTable, type Column } from '@/components/reports/DataTable';
import { TotalsRow } from '@/components/reports/TotalsRow';
import {
  LoadingState,
  EmptyState,
  ErrorState,
  ReportHeader,
} from '@/components/reports/StateViews';
import { useReport } from '@/hooks/useReport';
import {
  REPORT_PATHS,
  defaultRange,
  type ExpenseResponse,
  type ExpenseRow,
} from '@/lib/reports';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function buildColumns(t: (k: keyof Dict) => string): Array<Column<ExpenseRow>> {
  return [
    { key: 'date',     header: t('table.date'),         render: (r) => r.businessDate },
    { key: 'number',   header: t('table.expenseNumber'),render: (r) => r.expenseNumber },
    { key: 'category', header: t('form.category'),      render: (r) => r.categoryName },
    { key: 'amount',   header: t('table.amount'),       align: 'right', render: (r) => r.amount },
    { key: 'method',   header: t('table.method'),       render: (r) => r.paymentMethod },
    { key: 'status',   header: t('table.status'),       render: (r) => r.status },
    { key: 'desc',     header: t('form.description'),   render: (r) => r.description },
  ];
}

function ExpensesContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const def = defaultRange();
  const from = searchParams.get('from') ?? def.from;
  const to = searchParams.get('to') ?? def.to;
  const status = searchParams.get('status') ?? '';

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (status) p.set('status', status);
    return p.toString();
  }, [from, to, status]);

  const state = useReport<ExpenseResponse>(REPORT_PATHS.expenses, query);
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell>
      <ReportHeader
        title={t('reports.cards.expenses.title')}
        subtitle={t('reports.expenses.subtitle')}
      />

      <FilterBar>
        <SelectFilter
          paramName='status'
          label={t('table.status')}
          defaultValue=''
          options={[
            { value: '', label: t('reports.filter.allStatuses') },
            { value: 'DRAFT', label: t('reports.filter.status.draft') },
            { value: 'PENDING', label: t('reports.filter.status.pending') },
            { value: 'APPROVED', label: t('reports.filter.status.approved') },
            { value: 'REJECTED', label: t('reports.filter.status.rejected') },
          ]}
        />
      </FilterBar>

      {state.status === 'loading' && <LoadingState />}

      {state.status === 'error' && (
        <ErrorState status={state.error.status} message={state.error.message} />
      )}

      {state.status === 'ready' && (
        <>
          <TotalsRow
            items={[
              { label: t('totals.total'),   value: state.data.totals.amount, emphasis: true },
              { label: t('totals.cash'),    value: state.data.totals.cashAmount },
              { label: t('totals.nonCash'), value: state.data.totals.nonCashAmount },
              { label: t('totals.rows'),    value: String(state.data.totals.rowCount) },
            ]}
          />

          {state.data.totals.byCategory.length > 0 && (
            <div className='rounded-2xl border border-slate-200 bg-white p-4'>
              <h2 className='text-sm font-medium text-slate-700'>{t('reports.expenses.byCategory')}</h2>
              <ul className='mt-2 divide-y divide-slate-100'>
                {state.data.totals.byCategory.map((c) => (
                  <li key={c.categoryId} className='flex items-center justify-between py-1.5 text-sm'>
                    <span className='text-slate-600'>{c.categoryName}</span>
                    <span className='font-mono text-slate-800'>{c.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.data.rows.length === 0 ? (
            <EmptyState message={t('reports.expenses.empty')} />
          ) : (
            <DataTable columns={columns} rows={state.data.rows} rowKey={(r) => r.id} />
          )}
        </>
      )}
    </ReportShell>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <ExpensesContent />
    </Suspense>
  );
}
