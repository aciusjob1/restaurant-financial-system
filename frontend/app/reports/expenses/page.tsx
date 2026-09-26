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

const columns: Array<Column<ExpenseRow>> = [
  { key: 'date',     header: 'Date',        render: (r) => r.businessDate },
  { key: 'number',   header: 'Expense #',   render: (r) => r.expenseNumber },
  { key: 'category', header: 'Category',    render: (r) => r.categoryName },
  { key: 'amount',   header: 'Amount',      align: 'right', render: (r) => r.amount },
  { key: 'method',   header: 'Method',      render: (r) => r.paymentMethod },
  { key: 'status',   header: 'Status',      render: (r) => r.status },
  { key: 'desc',     header: 'Description', render: (r) => r.description },
];

function ExpensesContent() {
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

  return (
    <ReportShell>
      <ReportHeader
        title="Expenses"
        subtitle="Expenses across the selected range, grouped by category and payment method."
      />

      <FilterBar>
        <SelectFilter
          paramName="status"
          label="Status"
          defaultValue=""
          options={[
            { value: '', label: 'All statuses' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
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
              { label: 'Total',    value: state.data.totals.amount, emphasis: true },
              { label: 'Cash',     value: state.data.totals.cashAmount },
              { label: 'Non-Cash', value: state.data.totals.nonCashAmount },
              { label: 'Rows',     value: String(state.data.totals.rowCount) },
            ]}
          />

          {state.data.totals.byCategory.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-medium text-slate-700">By Category</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {state.data.totals.byCategory.map((c) => (
                  <li key={c.categoryId} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-slate-600">{c.categoryName}</span>
                    <span className="font-mono text-slate-800">{c.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

export default function ExpensesPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <ExpensesContent />
    </Suspense>
  );
}