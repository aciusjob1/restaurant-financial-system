'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ReportShell } from '@/components/reports/ReportShell';
import { FilterBar } from '@/components/reports/FilterBar';
import { DataTable, type Column } from '@/components/reports/DataTable';
import { TotalsRow } from '@/components/reports/TotalsRow';
import { Pager } from '@/components/reports/Pager';
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
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function diffClass(v: string | null): string {
  if (v === null) return 'text-slate-400';
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-700';
}

function buildColumns(t: (k: keyof Dict) => string): Array<Column<ReconciliationRow>> {
  return [
    { key: 'date',   header: t('table.date'),             render: (r) => r.businessDate },
    { key: 'user',   header: t('table.waiter'),           render: (r) => r.fullName },
    { key: 'expc',   header: t('table.expectedCash'),     align: 'right', render: (r) => r.expectedCash },
    { key: 'expm',   header: t('table.expectedMobile'),   align: 'right', render: (r) => r.expectedMobile },
    { key: 'actc',   header: t('table.actualCash'),       align: 'right', render: (r) => r.actualCash ?? '\u2014' },
    { key: 'actm',   header: t('table.actualMobile'),     align: 'right', render: (r) => r.actualMobile ?? '\u2014' },
    { key: 'cdiff',  header: t('totals.cashDiff'),        align: 'right',
      render: (r) => <span className={diffClass(r.cashDifference)}>{r.cashDifference ?? '\u2014'}</span> },
    { key: 'mdiff',  header: t('totals.mobileDiff'),      align: 'right',
      render: (r) => <span className={diffClass(r.mobileDifference)}>{r.mobileDifference ?? '\u2014'}</span> },
    { key: 'status', header: t('table.status'),           render: (r) => r.status },
  ];
}

function ReconciliationsContent() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const def = defaultRange();
  const from = searchParams.get('from') ?? def.from;
  const to = searchParams.get('to') ?? def.to;
  const offset = Number(searchParams.get('offset') ?? '0');
  const limit = 100;

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return p.toString();
  }, [from, to, offset, limit]);

  const goToOffset = (nextOffset: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextOffset <= 0) next.delete('offset');
    else next.set('offset', String(nextOffset));
    router.push(`${pathname}?${next.toString()}`);
  };

  const state = useReport<ReconciliationsResponse>(REPORT_PATHS.reconciliations, query);
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell printTitle={t('reports.cards.reconciliations.title')}>       <ReportHeader
        title={t('reports.cards.reconciliations.title')}
        subtitle={t('reports.reconciliations.subtitle')}
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
              { label: t('totals.cashDiff'),   value: state.data.totals.cashDifference, emphasis: true },
              { label: t('totals.mobileDiff'), value: state.data.totals.mobileDifference },
              { label: t('totals.rows'),       value: String(state.data.totals.count) },
            ]}
          />

          <Pager
            offset={offset}
            limit={limit}
            total={state.data.totals.count}
            onChange={goToOffset}
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
