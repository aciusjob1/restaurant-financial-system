'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import {
  REPORT_PATHS,
  type DailySalesResponse,
  type SupplierBalancesResponse,
} from '@/lib/reports';

type Period = 'daily' | 'weekly' | 'monthly' | 'annual';

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

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'annual', label: 'Annual' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsState>({ kind: 'loading' });
  const [fetching, setFetching] = useState(false);
  const [anchorDate, setAnchorDate] = useState<string>(() => localISO(new Date()));
  const [period, setPeriod] = useState<Period>('daily');

  const range = useMemo(() => computeRange(anchorDate, period), [anchorDate, period]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setFetching(true);
      try {
        const qs = `from=${range.from}&to=${range.to}`;

        const [daily, suppliers] = await Promise.all([
          apiFetch<DailySalesResponse>(`${REPORT_PATHS.dailySales}?${qs}`),
          apiFetch<SupplierBalancesResponse>(REPORT_PATHS.supplierBalances),
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

  function resetToToday() {
    setAnchorDate(localISO(new Date()));
  }

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </header>

      <section className="space-y-3">
        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Date</span>
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
            Today
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
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {fetching && (
              <span className="text-xs text-slate-400">Refreshing…</span>
            )}
            <span className="text-xs text-slate-500 font-mono">
              {range.from} → {range.to}
            </span>
          </div>
        </div>

        {stats.kind === 'loading' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
            Loading statistics…
          </div>
        )}

        {stats.kind === 'forbidden' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Statistics require a MANAGER, OWNER, or AUDITOR role.
          </div>
        )}

        {stats.kind === 'error' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Unable to load dashboard statistics.
          </div>
        )}

        {stats.kind === 'ready' && (
          <>
            {stats.data.rowCount === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                No business-day records in this range. The figures below are the
                backend&apos;s totals for {stats.data.rangeFrom} → {stats.data.rangeTo}.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Sales" value={stats.data.salesTotal} />
              <StatCard
                label="Collected"
                value={stats.data.collectionsTotal}
                hint={`Cash ${stats.data.collectionsCash} - Mobile ${stats.data.collectionsMobile}`}
                hintMuted
              />
              <StatCard label="Expenses" value={stats.data.expenseTotal} />
              <StatCard
                label="Cash Difference"
                value={stats.data.cashDifference}
                valueClassName={diffColor(stats.data.cashDifference)}
              />
              <StatCard label="Handovers" value={stats.data.handoverTotal} />
              <StatCard
                label="Supplier Balance"
                value={stats.data.supplierBalance}
                hint="Current balance • As of today"
                hintMuted
              />
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-medium text-slate-900">Reports</h2>
        <p className="mt-2 text-sm text-slate-600">
          Operational and financial reports. All calculations are performed server-side.
        </p>
        <a
          href="/reports"
          className="mt-3 inline-block rounded-lg bg-slate-900 text-white px-4 py-2 text-sm"
        >
          Open reports
        </a>
      </section>
    </>
  );
}
