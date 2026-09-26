'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SelectField, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'SUBMITTED', 'REVIEWED'] as const;

type Reconciliation = {
  id: string;
  shiftId: string;
  userId: string;
  expectedCash: string;
  expectedMobile: string;
  actualCash: string | null;
  actualMobile: string | null;
  cashDifference: string | null;
  mobileDifference: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type Shift = { id: string; userId: string; businessDate: string };
type User = { id: string; fullName: string; username: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function ReconciliationsPage() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    const qs = params.toString();
    apiFetch<{ success: true; reconciliations: Reconciliation[] }>(
      `/api/v1/reconciliations${qs ? '?' + qs : ''}`
    )
      .then((r) => setReconciliations(r.reconciliations))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; shifts: Shift[] }>('/api/v1/shifts')
      .then((r) => {
        const map: Record<string, Shift> = {};
        for (const s of r.shifts) map[s.id] = s;
        setShifts(map);
      })
      .catch(() => {});
    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterStatus]);

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Reconciliations"
        subtitle="Waiters declare expected vs actual cash/mobile; managers review and approve or send back."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <SelectField
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Business date</th>
              <th className="text-left px-3 py-2 font-medium">Waiter</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Expected cash</th>
              <th className="text-right px-3 py-2 font-medium">Actual cash</th>
              <th className="text-right px-3 py-2 font-medium">Cash diff</th>
              <th className="text-right px-3 py-2 font-medium">Mobile diff</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && reconciliations.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No reconciliations.</td></tr>
            )}
            {reconciliations.map((r) => {
              const sh = shifts[r.shiftId];
              const cashDiff = r.cashDifference;
              const cashDiffClass =
                cashDiff === null ? 'text-slate-400'
                : parseFloat(cashDiff) === 0 ? 'text-slate-500'
                : parseFloat(cashDiff) > 0 ? 'text-emerald-700'
                : 'text-red-700';
              const mobileDiff = r.mobileDifference;
              const mobileDiffClass =
                mobileDiff === null ? 'text-slate-400'
                : parseFloat(mobileDiff) === 0 ? 'text-slate-500'
                : parseFloat(mobileDiff) > 0 ? 'text-emerald-700'
                : 'text-red-700';
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{sh ? sh.businessDate : r.shiftId.slice(0, 8) + '…'}</td>
                  <td className="px-3 py-2">{userName(r.userId)}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs rounded bg-slate-100 px-2 py-0.5">{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.expectedCash}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.actualCash ?? '—'}</td>
                  <td className={'px-3 py-2 text-right font-mono ' + cashDiffClass}>{cashDiff ?? '—'}</td>
                  <td className={'px-3 py-2 text-right font-mono ' + mobileDiffClass}>{mobileDiff ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/ops/reconciliations/${r.id}`}
                      className="text-xs text-slate-700 underline hover:text-slate-900"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}