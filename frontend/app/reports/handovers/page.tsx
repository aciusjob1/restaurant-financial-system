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
  type HandoversResponse,
  type HandoverRow,
} from '@/lib/reports';

function shortTs(iso: string | null): string {
  if (!iso) return '—';
  // Render as the browser's local time; the value is a UTC ISO string.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const columns: Array<Column<HandoverRow>> = [
  { key: 'date',    header: 'Date',       render: (r) => r.businessDate },
  { key: 'from',    header: 'From',       render: (r) => r.fromFullName },
  { key: 'to',      header: 'To',         render: (r) => r.toFullName },
  { key: 'amount',  header: 'Amount',     align: 'right', render: (r) => r.amount },
  { key: 'status',  header: 'Status',     render: (r) => r.status },
  { key: 'hAt',     header: 'Handed Over', render: (r) => shortTs(r.handedOverAt) },
  { key: 'cAt',     header: 'Confirmed',   render: (r) => shortTs(r.confirmedAt) },
];

function HandoversContent() {
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

  const state = useReport<HandoversResponse>(REPORT_PATHS.handovers, query);

  return (
    <ReportShell>
      <ReportHeader
        title="Cash Handover Ledger"
        subtitle="Chronological list of handovers between staff, with confirmation state."
      />

      <FilterBar>
        <SelectFilter
          paramName="status"
          label="Status"
          defaultValue=""
          options={[
            { value: '', label: 'All statuses' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'CONFIRMED', label: 'Confirmed' },
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
              { label: 'Total Amount',     value: state.data.totals.amount, emphasis: true },
              { label: 'Confirmed',        value: state.data.totals.confirmedAmount },
              { label: 'Pending',          value: state.data.totals.pendingAmount },
              { label: 'Confirmed Count',  value: String(state.data.totals.confirmedCount) },
              { label: 'Pending Count',    value: String(state.data.totals.pendingCount) },
              { label: 'Rows',             value: String(state.data.totals.rowCount) },
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

export default function HandoversPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <HandoversContent />
    </Suspense>
  );
}