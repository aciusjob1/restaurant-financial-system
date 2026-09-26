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

function diffClass(v: string): string {
  // Sign detection only — no arithmetic. Rendering concern, not a total.
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-700';
}

const columns: Array<Column<DailySalesRow>> = [
  { key: 'date',   header: 'Date',          render: (r) => r.businessDate },
  { key: 'sales',  header: 'Sales',         align: 'right', render: (r) => r.salesTotal },
  { key: 'cash',   header: 'Cash Sales',    align: 'right', render: (r) => r.cashSales },
  { key: 'mob',    header: 'Mobile Sales',  align: 'right', render: (r) => r.mobileSales },
  { key: 'coll',   header: 'Collections',   align: 'right', render: (r) => r.collectionsTotal },
  { key: 'acash',  header: 'Actual Cash',   align: 'right', render: (r) => r.actualCash },
  { key: 'cdiff',  header: 'Cash Diff',     align: 'right',
    render: (r) => <span className={diffClass(r.cashDifference)}>{r.cashDifference}</span> },
  { key: 'mdiff',  header: 'Mobile Diff',   align: 'right',
    render: (r) => <span className={diffClass(r.mobileDifference)}>{r.mobileDifference}</span> },
  { key: 'ho',     header: 'Handover',      align: 'right', render: (r) => r.handoverTotal },
  { key: 'exp',    header: 'Expenses',      align: 'right', render: (r) => r.expenseTotal },
  { key: 'status', header: 'Closing',       render: (r) => r.closingStatus ?? '—' },
];

function DailySalesContent() {
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

  return (
    <ReportShell>
      <ReportHeader
        title="Daily Sales & Cash Position"
        subtitle="Per business date: sales, collections, reconciliation, handover, and expenses."
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
              { label: 'Sales Total',    value: state.data.totals.salesTotal,     emphasis: true },
              { label: 'Expense Total',  value: state.data.totals.expenseTotal },
              { label: 'Handover Total', value: state.data.totals.handoverTotal },
              { label: 'Cash Diff',      value: state.data.totals.cashDifference },
              { label: 'Mobile Diff',    value: state.data.totals.mobileDifference },
              { label: 'Days',           value: String(state.data.totals.rowCount) },
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