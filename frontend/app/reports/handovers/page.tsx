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
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function shortTs(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function buildColumns(t: (k: keyof Dict) => string): Array<Column<HandoverRow>> {
  return [
    { key: 'date',    header: t('table.date'),        render: (r) => r.businessDate },
    { key: 'from',    header: t('table.from'),        render: (r) => r.fromFullName },
    { key: 'to',      header: t('table.to'),          render: (r) => r.toFullName },
    { key: 'amount',  header: t('table.amount'),      align: 'right', render: (r) => r.amount },
    { key: 'status',  header: t('table.status'),      render: (r) => r.status },
    { key: 'hAt',     header: t('table.handedOver'),  render: (r) => shortTs(r.handedOverAt) },
    { key: 'cAt',     header: t('table.confirmed'),   render: (r) => shortTs(r.confirmedAt) },
  ];
}

function HandoversContent() {
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

  const state = useReport<HandoversResponse>(REPORT_PATHS.handovers, query);
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell>
      <ReportHeader
        title={t('reports.cards.handovers.title')}
        subtitle={t('reports.handovers.subtitle')}
      />

      <FilterBar>
        <SelectFilter
          paramName='status'
          label={t('table.status')}
          defaultValue=''
          options={[
            { value: '', label: t('reports.filter.allStatuses') },
            { value: 'PENDING', label: t('reports.filter.status.pending') },
            { value: 'CONFIRMED', label: t('reports.filter.status.confirmed') },
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
              { label: t('totals.totalAmount'),     value: state.data.totals.amount, emphasis: true },
              { label: t('totals.confirmedAmount'), value: state.data.totals.confirmedAmount },
              { label: t('totals.pendingAmount'),   value: state.data.totals.pendingAmount },
              { label: t('totals.confirmedCount'),  value: String(state.data.totals.confirmedCount) },
              { label: t('totals.pendingCount'),    value: String(state.data.totals.pendingCount) },
              { label: t('totals.rows'),            value: String(state.data.totals.rowCount) },
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
