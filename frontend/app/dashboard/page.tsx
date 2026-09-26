'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import {
  REPORT_PATHS,
  type DailySalesResponse,
  type HandoversResponse,
  type SupplierBalancesResponse,
} from '@/lib/reports';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

type Stats = {
  windowFrom: string;
  windowTo: string;
  salesTotal: string;
  expenseTotal: string;
  cashDifference: string;
  handoverTotal: string;
  pendingHandovers: number;
  supplierBalance: string;
};

type StatsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: Stats }
  | { kind: 'forbidden' }
  | { kind: 'error' };

const DASHBOARD_WINDOW_DAYS = 7;

function shortRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - DASHBOARD_WINDOW_DAYS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function diffColor(v: string): string {
  if (v === '0.00' || v === '-0.00') return 'text-slate-500';
  return v.startsWith('-') ? 'text-red-600' : 'text-slate-900';
}

function StatCard({
  label,
  value,
  valueClassName,
  hint,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={'mt-2 text-xl font-mono ' + (valueClassName ?? 'text-slate-900')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [stats, setStats] = useState<StatsState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<MeResponse>('/api/v1/auth/me');
        if (!cancelled) setMe(res.user);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.push('/login');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setStats({ kind: 'loading' });

    (async () => {
      try {
        const { from, to } = shortRange();
        const qs = `from=${from}&to=${to}`;

        const [daily, handovers, suppliers] = await Promise.all([
          apiFetch<DailySalesResponse>(`${REPORT_PATHS.dailySales}?${qs}`),
          apiFetch<HandoversResponse>(`${REPORT_PATHS.handovers}?${qs}`),
          apiFetch<SupplierBalancesResponse>(REPORT_PATHS.supplierBalances),
        ]);

        if (cancelled) return;
        setStats({
          kind: 'ready',
          data: {
            windowFrom: from,
            windowTo: to,
            salesTotal: daily.totals.salesTotal,
            expenseTotal: daily.totals.expenseTotal,
            cashDifference: daily.totals.cashDifference,
            handoverTotal: daily.totals.handoverTotal,
            pendingHandovers: handovers.totals.pendingCount,
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
      }
    })();

    return () => { cancelled = true; };
  }, [me, router]);

  async function logout() {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  }

  if (!me) return <main className="p-6">Loading...</main>;

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">{me.fullName} - {me.role}</p>
        </div>
        <button onClick={logout}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          Sign out
        </button>
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-slate-900">Snapshot</h2>
          {stats.kind === 'ready' && (
            <span className="text-xs text-slate-500">
              {stats.data.windowFrom} → {stats.data.windowTo}
            </span>
          )}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Sales" value={stats.data.salesTotal} />
            <StatCard label="Expenses" value={stats.data.expenseTotal} />
            <StatCard
              label="Cash Diff"
              value={stats.data.cashDifference}
              valueClassName={diffColor(stats.data.cashDifference)}
            />
            <StatCard label="Handovers" value={stats.data.handoverTotal} />
            <StatCard
              label="Supplier Balance"
              value={stats.data.supplierBalance}
              hint={
                stats.data.pendingHandovers > 0
                  ? `${stats.data.pendingHandovers} handover${stats.data.pendingHandovers === 1 ? '' : 's'} pending`
                  : undefined
              }
            />
          </div>
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
    </main>
  );
}