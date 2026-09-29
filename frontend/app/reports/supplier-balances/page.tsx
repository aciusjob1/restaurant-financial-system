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
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

function balanceClass(v: string): string {
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-700';
}

function buildColumns(t: (k: keyof Dict) => string): Array<Column<SupplierBalanceRow>> {
  return [
    { key: 'num',       header: t('table.supplierNumber'), render: (r) => r.supplierNumber },
    { key: 'name',      header: t('table.name'),           render: (r) => r.name },
    { key: 'invoiced',  header: t('table.invoiced'),       align: 'right', render: (r) => r.totalInvoiced },
    { key: 'paid',      header: t('table.paid'),           align: 'right', render: (r) => r.totalPaid },
    { key: 'allocated', header: t('table.allocated'),      align: 'right', render: (r) => r.totalAllocated },
    { key: 'unalloc',   header: t('table.unallocated'),    align: 'right', render: (r) => r.totalUnallocated },
    { key: 'balance',   header: t('table.balance'),        align: 'right',
      render: (r) => <span className={balanceClass(r.balance)}>{r.balance}</span> },
    { key: 'active',    header: t('table.active'),         render: (r) => (r.isActive ? t('common.yes') : t('common.no')) },
  ];
}

function SupplierBalancesContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const includeInactive = searchParams.get('includeInactive') === 'true';

  const query = useMemo(() => {
    return includeInactive ? 'includeInactive=true' : '';
  }, [includeInactive]);

  const state = useReport<SupplierBalancesResponse>(REPORT_PATHS.supplierBalances, query);
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <ReportShell>
      <ReportHeader
        title={t('reports.cards.supplierBalances.title')}
        subtitle={t('reports.supplierBalances.subtitle')}
      />

      <FilterBar showDates={false}>
        <SelectFilter
          paramName='includeInactive'
          label={t('reports.filter.show')}
          defaultValue=''
          options={[
            { value: '', label: t('reports.filter.showActiveOnly') },
            { value: 'true', label: t('common.includeInactive') },
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
              { label: t('totals.totalBalance'),  value: state.data.totals.balance, emphasis: true },
              { label: t('totals.totalInvoiced'), value: state.data.totals.invoiced },
              { label: t('totals.totalPaid'),     value: state.data.totals.paid },
              { label: t('totals.rows'),          value: String(state.data.rows.length) },
            ]}
          />

          {state.data.rows.length === 0 ? (
            <EmptyState message={t('reports.supplierBalances.empty')} />
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
