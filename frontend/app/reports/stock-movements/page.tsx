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
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function buildColumns(t: (k: keyof Dict) => string): Array<Column<StockMovementRow>> {
  return [
    { key: 'date',     header: t('table.date'),           render: (r) => r.businessDate },
    { key: 'number',   header: t('table.movementNumber'), render: (r) => r.movementNumber },
    { key: 'material', header: t('form.material'),        render: (r) => r.materialName ?? r.materialId },
    { key: 'type',     header: t('form.type'),            render: (r) => r.type },
    { key: 'dir',      header: t('form.direction'),       render: (r) => r.direction },
    { key: 'qty',      header: t('form.quantity'),        align: 'right', render: (r) => r.quantity },
    { key: 'ucost',    header: t('table.unitCost'),       align: 'right', render: (r) => r.unitCost ?? '\u2014' },
    { key: 'tcost',    header: t('table.total'),          align: 'right', render: (r) => r.totalCost ?? '\u2014' },
    { key: 'ref',      header: t('table.reference'),      render: (r) => r.reference ?? '\u2014' },
  ];
}

function StockMovementsContent() {
  const { t } = useT();
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
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell printTitle={t('reports.cards.stockMovements.title')}>       <ReportHeader
        title={t('reports.cards.stockMovements.title')}
        subtitle={t('reports.stockMovements.subtitle')}
      />

      <FilterBar>
        <SelectFilter
          paramName='type'
          label={t('form.type')}
          defaultValue=''
          options={[
            { value: '', label: t('reports.filter.allTypes') },
            { value: 'PURCHASE', label: t('reports.filter.type.purchase') },
            { value: 'OPENING', label: t('reports.filter.type.opening') },
            { value: 'CONSUMPTION', label: t('reports.filter.type.consumption') },
            { value: 'WASTE', label: t('reports.filter.type.waste') },
            { value: 'ADJUSTMENT', label: t('reports.filter.type.adjustment') },
          ]}
        />
        <SelectFilter
          paramName='direction'
          label={t('form.direction')}
          defaultValue=''
          options={[
            { value: '', label: t('reports.filter.both') },
            { value: 'IN', label: t('reports.filter.dir.in') },
            { value: 'OUT', label: t('reports.filter.dir.out') },
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
              { label: t('totals.totalIn'),   value: state.data.totals.totalIn, emphasis: true },
              { label: t('totals.totalOut'),  value: state.data.totals.totalOut, emphasis: true },
              { label: t('totals.netChange'), value: state.data.totals.netChange },
              { label: t('totals.movements'), value: String(state.data.totals.movementCount) },
            ]}
          />

          {state.data.totals.byType.length > 0 && (
            <div className='rounded-2xl border border-slate-200 bg-white p-4'>
              <h2 className='text-sm font-medium text-slate-700'>{t('reports.stockMovements.byType')}</h2>
              <ul className='mt-2 divide-y divide-slate-100'>
                {state.data.totals.byType.map((row) => (
                  <li key={row.type} className='flex items-center justify-between py-1.5 text-sm'>
                    <span className='text-slate-600'>
                      {row.type} <span className='text-slate-400'>({row.count})</span>
                    </span>
                    <span className='font-mono text-slate-800'>
                      {t('reports.stockMovements.inPrefix')}{row.totalIn}{t('reports.stockMovements.outPrefix')}{row.totalOut}
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
