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
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function diffClass(v: string): string {
  if (v === '0.00') return 'text-slate-400';
  return v.startsWith('-') ? 'text-red-600' : 'text-amber-700';
}

function buildColumns(t: (k: keyof Dict) => string): Array<Column<SalesVsPosRow>> {
  return [
    { key: 'date',  header: t('table.date'),          render: (r) => r.businessDate },
    { key: 'post',  header: t('table.posTotal'),      align: 'right', render: (r) => r.posTotal },
    { key: 'posc',  header: t('table.posCash'),       align: 'right', render: (r) => r.posCash },
    { key: 'posm',  header: t('table.posMobile'),     align: 'right', render: (r) => r.posMobile },
    { key: 'collt', header: t('table.collTotal'),     align: 'right', render: (r) => r.collectionsTotal },
    { key: 'collc', header: t('table.collCash'),      align: 'right', render: (r) => r.collectionsCash },
    { key: 'collm', header: t('table.collMobile'),    align: 'right', render: (r) => r.collectionsMobile },
    { key: 'cv',    header: t('table.cashVar'),       align: 'right',
      render: (r) => <span className={diffClass(r.cashVariance)}>{r.cashVariance}</span> },
    { key: 'mv',    header: t('table.mobileVar'),     align: 'right',
      render: (r) => <span className={diffClass(r.mobileVariance)}>{r.mobileVariance}</span> },
    { key: 'ov',    header: t('table.otherVar'),      align: 'right',
      render: (r) => <span className={diffClass(r.otherVariance)}>{r.otherVariance}</span> },
    { key: 'rec',   header: t('table.reconciled'),    render: (r) => (r.isReconciled ? t('common.yes') : t('common.no')) },
  ];
}

function SalesVsPosContent() {
  const { t } = useT();
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
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell>
      <ReportHeader
        title={t('reports.cards.salesVsPos.title')}
        subtitle={t('reports.salesVsPos.subtitle')}
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
              { label: t('totals.cashVariance'),   value: state.data.totals.cashVariance,   emphasis: true },
              { label: t('totals.mobileVariance'), value: state.data.totals.mobileVariance, emphasis: true },
              { label: t('totals.otherVariance'),  value: state.data.totals.otherVariance },
              { label: t('totals.days'),           value: String(state.data.totals.rowCount) },
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
