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
  type ReconciliationsResponse,
  type ReconciliationRow,
} from '@/lib/reports';

function diffClass(v: string | null): string {
  if (v === null) return 'text-slate-400';
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-700';
}

const columns: Array<Column<ReconciliationRow>> = [
  { key: 'date',    header: 'Date',           render: (r) => r.businessDate },
  { key: 'user',    header: 'Waiter',         render: (r) => r.fullName },
  { key: 'expc',    header: 'Expected Cash',  align: 'right', render: (r) => r.expectedCash },
  { key: 'expm',    header: 'Expected Mobile',align: 'right', render: (r) => r.expectedMobile },
  { key: 'actc',    header: 'Actual Cash',    align: 'right', render: (r) => r.actualCash ?? '—' },
  { key: 'actm',    header: 'Actual Mobile',  align: 'right', render: (r) => r.actualMobile ?? '—' },
  { key: 'cdiff',   header: 'Cash Diff',      align: 'right',
    render: (r) => <span className={diffClass(r.cashDifference)}>{r.cashDifference ?? '—'}</span> },
  { key: 'mdiff',   header: 'Mobile Diff',    align: 'right',
    render: (r) => <span className={diffClass(r.mobileDifference)}>{r.mobileDifference ?? '—'}</span> },
  { key: 'status',  header: 'Status',         render: (r) => r.status },
];

function ReconciliationsContent() {
  const searchParams = useSearchParams();
  const def = defaultRange();
  const from = searchParams.get('from') ?? def.from;
  const to = searchParams.get('to') ?? def.to;

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    return p.toString();
  }, [from, to]);

  const state = useReport<ReconciliationsResponse>(REPORT_PATHS.reconciliations, query);

  return (
    <ReportShell>
      <ReportHeader
        title="Reconciliation Summary"
        subtitle="Per-shift expected vs actual cash and mobile, with differences."
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
              { label: 'Cash Diff',   value: state.data.totals.cashDifference, emphasis: true },
              { label: 'Mobile Diff', value: state.data.totals.mobileDifference },
              { label: 'Rows',        value: String(state.data.totals.count) },
            ]}
          />

          {state.data.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <DataTable columns={columns} rows={state.data.rows} rowKey={(r) => r.id} />
          )}
        </>
      )}
    </ReportShell>
  );
}

export default function ReconciliationsPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <ReconciliationsContent />
    </Suspense>
  );
}