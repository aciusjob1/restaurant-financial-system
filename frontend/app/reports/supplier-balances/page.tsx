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
  type SupplierBalancesResponse,
  type SupplierBalanceRow,
} from '@/lib/reports';

function balanceClass(v: string): string {
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-700';
}

const columns: Array<Column<SupplierBalanceRow>> = [
  { key: 'num',       header: 'Supplier #',    render: (r) => r.supplierNumber },
  { key: 'name',      header: 'Name',          render: (r) => r.name },
  { key: 'invoiced',  header: 'Invoiced',      align: 'right', render: (r) => r.totalInvoiced },
  { key: 'paid',      header: 'Paid',          align: 'right', render: (r) => r.totalPaid },
  { key: 'allocated', header: 'Allocated',     align: 'right', render: (r) => r.totalAllocated },
  { key: 'unalloc',   header: 'Unallocated',   align: 'right', render: (r) => r.totalUnallocated },
  { key: 'balance',   header: 'Balance',       align: 'right',
    render: (r) => <span className={balanceClass(r.balance)}>{r.balance}</span> },
  { key: 'active',    header: 'Active',        render: (r) => (r.isActive ? 'Yes' : 'No') },
];

function SupplierBalancesContent() {
  const searchParams = useSearchParams();
  const includeInactive = searchParams.get('includeInactive') === 'true';

  const query = useMemo(() => {
    return includeInactive ? 'includeInactive=true' : '';
  }, [includeInactive]);

  const state = useReport<SupplierBalancesResponse>(REPORT_PATHS.supplierBalances, query);

  return (
    <ReportShell>
      <ReportHeader
        title="Supplier Balances"
        subtitle="Outstanding balance per supplier, based on posted invoices and active allocations."
      />

      <FilterBar showDates={false}>
        <SelectFilter
          paramName="includeInactive"
          label="Show"
          defaultValue=""
          options={[
            { value: '', label: 'Active suppliers only' },
            { value: 'true', label: 'Include inactive' },
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
              { label: 'Total Balance',  value: state.data.totals.balance, emphasis: true },
              { label: 'Total Invoiced', value: state.data.totals.invoiced },
              { label: 'Total Paid',     value: state.data.totals.paid },
              { label: 'Rows',           value: String(state.data.rows.length) },
            ]}
          />

          {state.data.rows.length === 0 ? (
            <EmptyState message="No suppliers found." />
          ) : (
            <DataTable columns={columns} rows={state.data.rows} rowKey={(r) => r.supplierId} />
          )}
        </>
      )}
    </ReportShell>
  );
}

export default function SupplierBalancesPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <SupplierBalancesContent />
    </Suspense>
  );
}