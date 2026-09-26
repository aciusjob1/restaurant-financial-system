'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, TextArea, SelectField, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_OPTIONS = ['ALL', 'OPEN', 'SUBMITTED', 'RECONCILING', 'CLOSED'] as const;

type User = { id: string; fullName: string; username: string };

type Shift = {
  id: string;
  userId: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  notes: string | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function ShiftsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState('');

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function loadShifts() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    if (filterDate) params.set('businessDate', filterDate);
    const qs = params.toString();
    apiFetch<{ success: true; shifts: Shift[] }>(`/api/v1/shifts${qs ? '?' + qs : ''}`)
      .then((r) => setShifts(r.shifts))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  useEffect(() => { loadShifts(); }, [filterStatus, filterDate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/shifts', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          openingCash: openingCash.trim() === '' ? undefined : openingCash.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setOpeningCash('');
      setNotes('');
      loadShifts();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Shifts"
        subtitle="Cashier shifts. Each shift accumulates collections, then reconciles and hands over."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="w-48">
          <SelectField
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <div className="w-48">
          <DateField
            label="Business date"
            value={filterDate}
            onChange={setFilterDate}
          />
        </div>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Start a shift</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DateField label="Business date" value={businessDate} onChange={setBusinessDate} required />
          <DecimalField
            label="Opening cash (optional)"
            value={openingCash}
            onChange={setOpeningCash}
            placeholder="0.00"
          />
        </div>
        <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />
        {err && <FormError code={err.code} message={err.message} />}
        <SubmitButton busy={busy}>Start shift</SubmitButton>
        <div className="text-xs text-slate-500">
          A user may only have one active (non-CLOSED) shift per business date.
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Business date</th>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Opening</th>
              <th className="text-left px-3 py-2 font-medium">Started</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && shifts.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No shifts.</td></tr>
            )}
            {shifts.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{s.businessDate}</td>
                <td className="px-3 py-2">{userName(s.userId)}</td>
                <td className="px-3 py-2">
                  <span className="text-xs rounded bg-slate-100 px-2 py-0.5">{s.status}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{s.openingCash ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{s.startedAt}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/ops/shifts/${s.id}`}
                    className="text-xs text-slate-700 underline hover:text-slate-900"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}