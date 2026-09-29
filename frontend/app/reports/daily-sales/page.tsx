'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ReportShell } from '@/components/reports/ReportShell';
import { FilterBar } from '@/components/reports/FilterBar';
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
  type DailySalesResponse,
  type DailySalesRow,
} from '@/lib/reports';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function diffClass(v: string): string {
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-700';
}

function buildColumns(t: (k: keyof Dict) => string): Array<Column<DailySalesRow>> {
  return [
    { key: 'date',   header: t('table.date'),         render: (r) => r.businessDate },
    { key: 'sales',  header: t('table.sales'),        align: 'right', render: (r) => r.salesTotal },
    { key: 'cash',   header: t('table.cashSales'),    align: 'right', render: (r) => r.cashSales },
    { key: 'mob',    header: t('table.mobileSales'),  align: 'right', render: (r) => r.mobileSales },
    { key: 'coll',   header: t('table.collections'),  align: 'right', render: (r) => r.collectionsTotal },
    { key: 'acash',  header: t('table.actualCash'),   align: 'right', render: (r) => r.actualCash },
    { key: 'cdiff',  header: t('totals.cashDiff'),    align: 'right',
      render: (r) => <span className={diffClass(r.cashDifference)}>{r.cashDifference}</span> },
    { key: 'mdiff',  header: t('totals.mobileDiff'),  align: 'right',
      render: (r) => <span className={diffClass(r.mobileDifference)}>{r.mobileDifference}</span> },
    { key: 'ho',     header: t('table.handover'),     align: 'right', render: (r) => r.handoverTotal },
    { key: 'exp',    header: t('table.expenses'),     align: 'right', render: (r) => r.expenseTotal },
    { key: 'status', header: t('table.closing'),      render: (r) => r.closingStatus ?? '\u2014' },
  ];
}

function DailySalesContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const def = defaultRange();

  const from = searchParams.get('from') ?? def.from;
  const to   = searchParams.get('to')   ?? def.to;

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    return p.toString();
  }, [from, to]);

  const state = useReport<DailySalesResponse>(REPORT_PATHS.dailySales, query);
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell>
      <ReportHeader
        title={t('reports.cards.dailySales.title')}
        subtitle={t('reports.dailySales.subtitle')}
      />

      <FilterBar />

      {state.status === 'loading' && <LoadingState />}

      {state.status === 'error' && (
        <ErrorState status={state.error.status} message={state.error.message} />
      )}

      {state.status === 'ready' && (
        <>
          <TotalsRow
            items={[
              { label: t('totals.salesTotal'),    value: state.data.totals.salesTotal,     emphasis: true },
              { label: t('totals.expenseTotal'),  value: state.data.totals.expenseTotal },
              { label: t('totals.handoverTotal'), value: state.data.totals.handoverTotal },
              { label: t('totals.cashDiff'),      value: state.data.totals.cashDifference },
              { label: t('totals.mobileDiff'),    value: state.data.totals.mobileDifference },
              { label: t('totals.days'),          value: String(state.data.totals.rowCount) },
            ]}
          />

          {state.data.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <DataTable
              columns={columns}
              rows={state.data.rows}
              rowKey={(r) => r.businessDate}
            />
          )}
        </>
      )}
    </ReportShell>
  );
}

export default function DailySalesPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <DailySalesContent />
    </Suspense>
  );
}
