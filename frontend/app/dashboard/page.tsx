'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import {
  REPORT_PATHS,
  type DailySalesResponse,
  type SupplierBalancesResponse,
  type ExpenseResponse,
  type DailySalesRow,
  type SupplierBalanceRow,
} from '@/lib/reports';
import {
  SalesOverTimeChart,
  CollectionsByMethodChart,
  ExpensesByCategoryChart,
  TopSuppliersChart,
} from '@/components/ops/DashboardCharts';

type Period = 'daily' | 'weekly' | 'monthly' | 'annual';
type ShiftInfo = {
  id: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
};

type MeInfo = { id: string; role: string } | null;

type Stats = {
  rangeFrom: string;
  rangeTo: string;
  rowCount: number;
  salesTotal: string;
  collectionsTotal: string;
  collectionsCash: string;
  collectionsMobile: string;
  expenseTotal: string;
  cashDifference: string;
  handoverTotal: string;
  supplierBalance: string;
  rows: DailySalesRow[];
  byCategory: Array<{ categoryId: string; categoryName: string; amount: string }>;
  supplierRows: SupplierBalanceRow[];
};

type StatsState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Stats }
  | { kind: 'forbidden' }
  | { kind: 'error' };

// ------------------------------------------------------------------
// Date helpers
//
// All helpers operate in the browser's LOCAL timezone and emit
// YYYY-MM-DD strings, which is what the backend expects. Do NOT use
// toISOString().slice(0,10) — that converts to UTC and can shift the
// date by one day at the boundary (relevant at UTC+3 in EAT).
// ------------------------------------------------------------------

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function computeRange(anchorISO: string, period: Period): { from: string; to: string } {
  const [y, m, d] = anchorISO.split('-').map(Number);
  if (!y || !m || !d) return { from: anchorISO, to: anchorISO };
  const anchor = new Date(y, m - 1, d);

  if (period === 'daily') {
    return { from: anchorISO, to: anchorISO };
  }
  if (period === 'weekly') {
    const start = startOfWeekMonday(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: localISO(start), to: localISO(end) };
  }
  if (period === 'monthly') {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0); // day 0 of next month = last of this month
    return { from: localISO(start), to: localISO(end) };
  }
  // annual
  const start = new Date(y, 0, 1);
  const end = new Date(y, 11, 31);
  return { from: localISO(start), to: localISO(end) };
}

function diffColor(v: string): string {
  if (v === '0.00' || v === '-0.00') return 'text-slate-500';
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-900';
}

// Net = Sales - Expenses. Salary payments are already Salary-category
// expenses, so they are counted inside expenseTotal and must not be
// subtracted again.
function netValue(salesTotal: string, expenseTotal: string): string {
  const sales = parseFloat(salesTotal) || 0;
  const expenses = parseFloat(expenseTotal) || 0;
  return (sales - expenses).toFixed(2);
}

function netClass(v: string): string {
  const n = parseFloat(v) || 0;
  if (Math.abs(n) < 0.005) return 'text-slate-500';
  return n > 0 ? 'text-emerald-700' : 'text-red-600';
}

// ------------------------------------------------------------------
// UI atoms
// ------------------------------------------------------------------

function StatCard({
  label,
  value,
  valueClassName,
  hint,
  hintMuted,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  hint?: string;
  hintMuted?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={'mt-2 text-lg font-mono ' + (valueClassName ?? 'text-slate-900')}>
        {value}
      </div>
      {hint && (
        <div className={'mt-1 text-xs ' + (hintMuted ? 'text-slate-400' : 'text-slate-500')}>
          {hint}
        </div>
      )}
    </div>
  );
}

type PeriodKey = 'dashboard.period.daily' | 'dashboard.period.weekly' | 'dashboard.period.monthly' | 'dashboard.period.annual';

const PERIODS: Array<{ key: Period; labelKey: PeriodKey }> = [
  { key: 'daily',   labelKey: 'dashboard.period.daily' },
  { key: 'weekly',  labelKey: 'dashboard.period.weekly' },
  { key: 'monthly', labelKey: 'dashboard.period.monthly' },
  { key: 'annual',  labelKey: 'dashboard.period.annual' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useT();
  const [stats, setStats] = useState<StatsState>({ kind: 'loading' });
  const [fetching, setFetching] = useState(false);
  const [anchorDate, setAnchorDate] = useState<string>(() => localISO(new Date()));
  const [period, setPeriod] = useState<Period>('daily');
  const [me, setMe] = useState<MeInfo>(null);
  const [todayShift, setTodayShift] = useState<ShiftInfo | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftFlash, setShiftFlash] = useState<string | null>(null);

  const range = useMemo(() => computeRange(anchorDate, period), [anchorDate, period]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setFetching(true);
      try {
        const qs = `from=${range.from}&to=${range.to}`;

        const [daily, suppliers, expenses] = await Promise.all([
          apiFetch<DailySalesResponse>(`${REPORT_PATHS.dailySales}?${qs}`),
          apiFetch<SupplierBalancesResponse>(REPORT_PATHS.supplierBalances),
          apiFetch<ExpenseResponse>(`${REPORT_PATHS.expenses}?${qs}`),
        ]);

        if (cancelled) return;
        setStats({
          kind: 'ready',
          data: {
            rangeFrom: range.from,
            rangeTo: range.to,
            rowCount: daily.totals.rowCount,
            salesTotal: daily.totals.salesTotal,
            collectionsTotal: daily.totals.collectionsTotal,
            collectionsCash: daily.totals.collectionsCash,
            collectionsMobile: daily.totals.collectionsMobile,
            expenseTotal: daily.totals.expenseTotal,
            cashDifference: daily.totals.cashDifference,
            handoverTotal: daily.totals.handoverTotal,
            supplierBalance: suppliers.totals.balance,
            rows: daily.rows,
            byCategory: expenses.totals.byCategory,
            supplierRows: suppliers.rows,
          },
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 401) { router.push('/login'); return; }
          if (err.status === 403) { setStats({ kind: 'forbidden' }); return; }
        }
        setStats({ kind: 'error' });
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => { cancelled = true; };
  }, [range.from, range.to, router]);

  async function loadShift() {
    setShiftLoading(true);
    try {
      const meRes = await apiFetch<{ success: true; user: { id: string; role: string } }>('/api/v1/auth/me');
      setMe({ id: meRes.user.id, role: meRes.user.role });
      const iso = localISO(new Date());
      const sRes = await apiFetch<{ success: true; shifts: ShiftInfo[] }>(`/api/v1/shifts?businessDate=${iso}`);
      const found = (sRes.shifts || []).find((sh) => sh.businessDate === iso) || null;
      setTodayShift(found);
    } catch {
      setMe(null);
      setTodayShift(null);
    } finally {
      setShiftLoading(false);
    }
  }

  useEffect(() => { loadShift(); }, []);

  const canManage = me?.role === 'OWNER' || me?.role === 'MANAGER';
  const isTodayOpen = todayShift?.status === 'OPEN';

  function resetToToday() {
    setAnchorDate(localISO(new Date()));
  }

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
      </header>

      <section className="space-y-3">
        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">{t('dashboard.date.label')}</span>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => { if (e.target.value) setAnchorDate(e.target.value); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </label>

          <button
            type="button"
            onClick={resetToToday}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('dashboard.today')}
          </button>

          <div className="flex items-center rounded-lg border border-slate-300 overflow-hidden">
            {PERIODS.map((p, i) => {
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={[
                    'px-3 py-2 text-sm',
                    i > 0 ? 'border-l border-slate-300' : '',
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {t(p.labelKey)}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {fetching && (
              <span className="text-xs text-slate-400">{t('dashboard.refreshing')}</span>
            )}
            <span className="text-xs text-slate-500 font-mono">
              {range.from} → {range.to}
            </span>
          </div>
        </div>

        {stats.kind === 'loading' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
            {t('dashboard.loading')}
          </div>
        )}

        {stats.kind === 'forbidden' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t('dashboard.forbidden')}
          </div>
        )}

        {stats.kind === 'error' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {t('dashboard.error')}
          </div>
        )}

        {stats.kind === 'ready' && (
          <>
            {stats.data.rowCount === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                {t('dashboard.noRecords.before')}
                {stats.data.rangeFrom} → {stats.data.rangeTo}
                {t('dashboard.noRecords.after')}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label={t('dashboard.stat.sales')} value={stats.data.salesTotal} />
              <StatCard
                label={t('dashboard.stat.collected')}
                value={stats.data.collectionsTotal}
                hint={t('dashboard.collected.hintPrefix') + stats.data.collectionsCash + t('dashboard.collected.hintMid') + stats.data.collectionsMobile}
                hintMuted
              />
              <StatCard label={t('dashboard.stat.expenses')} value={stats.data.expenseTotal} />
              <StatCard
                label={t('dashboard.stat.cashDifference')}
                value={stats.data.cashDifference}
                valueClassName={diffColor(stats.data.cashDifference)}
              />
              <StatCard label={t('dashboard.stat.handovers')} value={stats.data.handoverTotal} />
              <StatCard
                label={t('dashboard.stat.supplierBalance')}
                value={stats.data.supplierBalance}
                hint={t('dashboard.supplierBalance.hint')}
                hintMuted
              />
              <StatCard
                label={t('dashboard.stat.net')}
                value={netValue(stats.data.salesTotal, stats.data.expenseTotal)}
                valueClassName={netClass(netValue(stats.data.salesTotal, stats.data.expenseTotal))}
              />
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
              <SalesOverTimeChart rows={stats.data.rows} />
              <CollectionsByMethodChart
                cash={parseFloat(stats.data.collectionsCash) || 0}
                mobile={parseFloat(stats.data.collectionsMobile) || 0}
                other={Math.max(0,
                  (parseFloat(stats.data.collectionsTotal) || 0)
                  - (parseFloat(stats.data.collectionsCash) || 0)
                  - (parseFloat(stats.data.collectionsMobile) || 0)
                )}
              />
              <ExpensesByCategoryChart data={stats.data.byCategory} />
              <TopSuppliersChart rows={stats.data.supplierRows} />
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-medium text-slate-900">{t('dashboard.reports.heading')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('dashboard.reports.body')}
        </p>
        <a
          href="/reports"
          className="mt-3 inline-block rounded-lg bg-slate-900 text-white px-4 py-2 text-sm"
        >
          {t('dashboard.reports.openButton')}
        </a>
      </section>
    </>
  );
}