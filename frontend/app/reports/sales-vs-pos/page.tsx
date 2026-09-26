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
  type SalesVsPosResponse,
  type SalesVsPosRow,
} from '@/lib/reports';

function diffClass(v: string): string {
  if (v === '0.00') return 'text-slate-400';
  return v.startsWith('-') ? 'text-red-600' : 'text-amber-700';
}

const columns: Array<Column<SalesVsPosRow>> = [
  { key: 'date',      header: 'Date',           render: (r) => r.businessDate },
  { key: 'post',      header: 'POS Total',      align: 'right', render: (r) => r.posTotal },
  { key: 'posc',      header: 'POS Cash',       align: 'right', render: (r) => r.posCash },
  { key: 'posm',      header: 'POS Mobile',     align: 'right', render: (r) => r.posMobile },
  { key: 'collt',     header: 'Coll Total',     align: 'right', render: (r) => r.collectionsTotal },
  { key: 'collc',     header: 'Coll Cash',      align: 'right', render: (r) => r.collectionsCash },
  { key: 'collm',     header: 'Coll Mobile',    align: 'right', render: (r) => r.collectionsMobile },
  { key: 'cv',        header: 'Cash Var',       align: 'right',
    render: (r) => <span className={diffClass(r.cashVariance)}>{r.cashVariance}</span> },
  { key: 'mv',        header: 'Mobile Var',     align: 'right',
    render: (r) => <span className={diffClass(r.mobileVariance)}>{r.mobileVariance}</span> },
  { key: 'ov',        header: 'Other Var',      align: 'right',
    render: (r) => <span className={diffClass(r.otherVariance)}>{r.otherVariance}</span> },
  { key: 'rec',       header: 'Reconciled',     render: (r) => (r.isReconciled ? 'Yes' : 'No') },
];

function SalesVsPosContent() {
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

  const state = useReport<SalesVsPosResponse>(REPORT_PATHS.salesVsPos, query);

  return (
    <ReportShell>
      <ReportHeader
        title="Sales vs POS"
        subtitle="Declared POS sales compared to recorded collections, per business date."
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
              { label: 'Cash Variance',   value: state.data.totals.cashVariance,   emphasis: true },
              { label: 'Mobile Variance', value: state.data.totals.mobileVariance, emphasis: true },
              { label: 'Other Variance',  value: state.data.totals.otherVariance },
              { label: 'Days',            value: String(state.data.totals.rowCount) },
            ]}
          />

          {state.data.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <DataTable columns={columns} rows={state.data.rows} rowKey={(r) => r.businessDate} />
          )}
        </>
      )}
    </ReportShell>
  );
}

export default function SalesVsPosPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <SalesVsPosContent />
    </Suspense>
  );
}