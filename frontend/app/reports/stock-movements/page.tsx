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
  type StockMovementsResponse,
  type StockMovementRow,
} from '@/lib/reports';

const columns: Array<Column<StockMovementRow>> = [
  { key: 'date',     header: 'Date',      render: (r) => r.businessDate },
  { key: 'number',   header: 'Movement #', render: (r) => r.movementNumber },
  { key: 'material', header: 'Material',  render: (r) => r.materialName ?? r.materialId },
  { key: 'type',     header: 'Type',      render: (r) => r.type },
  { key: 'dir',      header: 'Direction', render: (r) => r.direction },
  { key: 'qty',      header: 'Quantity',  align: 'right', render: (r) => r.quantity },
  { key: 'ucost',    header: 'Unit Cost', align: 'right', render: (r) => r.unitCost ?? '—' },
  { key: 'tcost',    header: 'Total',     align: 'right', render: (r) => r.totalCost ?? '—' },
  { key: 'ref',      header: 'Reference', render: (r) => r.reference ?? '—' },
];

function StockMovementsContent() {
  const searchParams = useSearchParams();
  const def = defaultRange();
  const from = searchParams.get('from') ?? def.from;
  const to = searchParams.get('to') ?? def.to;
  const type = searchParams.get('type') ?? '';
  const direction = searchParams.get('direction') ?? '';

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (type) p.set('type', type);
    if (direction) p.set('direction', direction);
    return p.toString();
  }, [from, to, type, direction]);

  const state = useReport<StockMovementsResponse>(REPORT_PATHS.stockMovements, query);

  return (
    <ReportShell>
      <ReportHeader
        title="Stock Movements"
        subtitle="Append-only ledger of every stock movement across the selected range."
      />

      <FilterBar>
        <SelectFilter
          paramName="type"
          label="Type"
          defaultValue=""
          options={[
            { value: '', label: 'All types' },
            { value: 'PURCHASE', label: 'Purchase' },
            { value: 'OPENING', label: 'Opening' },
            { value: 'CONSUMPTION', label: 'Consumption' },
            { value: 'WASTE', label: 'Waste' },
            { value: 'ADJUSTMENT', label: 'Adjustment' },
          ]}
        />
        <SelectFilter
          paramName="direction"
          label="Direction"
          defaultValue=""
          options={[
            { value: '', label: 'Both' },
            { value: 'IN', label: 'In' },
            { value: 'OUT', label: 'Out' },
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
              { label: 'Total In',    value: state.data.totals.totalIn, emphasis: true },
              { label: 'Total Out',   value: state.data.totals.totalOut, emphasis: true },
              { label: 'Net Change',  value: state.data.totals.netChange },
              { label: 'Movements',   value: String(state.data.totals.movementCount) },
            ]}
          />

          {state.data.totals.byType.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-medium text-slate-700">By Type</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {state.data.totals.byType.map((t) => (
                  <li key={t.type} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-slate-600">
                      {t.type} <span className="text-slate-400">({t.count})</span>
                    </span>
                    <span className="font-mono text-slate-800">
                      in {t.totalIn} / out {t.totalOut}
                    </span>
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

export default function StockMovementsPage() {
  return (
    <Suspense fallback={<ReportShell><LoadingState /></ReportShell>}>
      <StockMovementsContent />
    </Suspense>
  );
}