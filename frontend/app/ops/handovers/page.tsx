'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SelectField, TextArea, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'CONFIRMED'] as const;

type Handover = {
  id: string;
  reconciliationId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  status: 'PENDING' | 'CONFIRMED';
  handedOverAt: string;
  confirmedAt: string | null;
  notes: string | null;
  confirmedNotes: string | null;
};

type Reconciliation = {
  id: string;
  shiftId: string;
  userId: string;
  status?: string;
  actualCash?: string | null;
  user?: { id: string; fullName: string } | null;
  shift?: { businessDate: string } | null;
};
type Shift = {
  id: string;
  businessDate: string;
  user?: { id: string; fullName: string } | null;
};
type User = { id: string; fullName: string; username: string; role: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function HandoversPage() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [recons, setRecons] = useState<Record<string, Reconciliation>>({});
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [receivableUsers, setReceivableUsers] = useState<User[]>([]);
  const [recordReconId, setRecordReconId] = useState('');
  const [recordToUserId, setRecordToUserId] = useState('');
  const [recordNotes, setRecordNotes] = useState('');

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    const qs = params.toString();
    apiFetch<{ success: true; handovers: Handover[] }>(
      `/api/v1/handovers${qs ? '?' + qs : ''}`
    )
      .then((r) => setHandovers(r.handovers))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; user: User }>('/api/v1/auth/me')
      .then((r) => setMyRole(r.user.role))
      .catch(() => {});
    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
    apiFetch<{ success: true; reconciliations: Reconciliation[] }>('/api/v1/reconciliations')
      .then((r) => {
        const map: Record<string, Reconciliation> = {};
        for (const x of r.reconciliations) map[x.id] = x;
        setRecons(map);
        const shiftIds = Array.from(new Set(r.reconciliations.map((x) => x.shiftId)));
        return Promise.all(
          shiftIds.map((sid) =>
            apiFetch<{ success: true; shift: Shift }>(`/api/v1/shifts/${sid}`)
              .then((s) => s.shift)
              .catch(() => null)
          )
        );
      })
      .then((shiftsArr) => {
        if (!shiftsArr) return;
        const map: Record<string, Shift> = {};
        for (const s of shiftsArr) if (s) map[s.id] = s;
        setShifts(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<{ success: true; users: User[] }>('/api/v1/handovers/receivable-users')
      .then((r) => setReceivableUsers(r.users))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterStatus]);



  function businessDate(h: Handover): string {
    const rec = recons[h.reconciliationId];
    if (!rec) return h.reconciliationId.slice(0, 8) + '…';
    const sh = shifts[rec.shiftId];
    return sh ? sh.businessDate : rec.shiftId.slice(0, 8) + '…';
  }

  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';

  const eligibleRecons = Object.values(recons).filter(
    (r) => r.actualCash != null && (r.status === 'SUBMITTED' || r.status === 'REVIEWED')
  );

  function reconLabel(r: Reconciliation): string {
    const date = r.shift?.businessDate ?? shifts[r.shiftId]?.businessDate ?? shortId(r.shiftId);
    const who = r.user?.fullName ?? shortId(r.userId);
    const amt = r.actualCash ?? '—';
    return date + ' — ' + who + ' — ' + amt;
  }

  function shortId(id: string): string {
    return id.slice(0, 8) + '…';
  }

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    if (u) return u.fullName;
    const rec = Object.values(recons).find((r) => r.userId === id && r.user?.fullName);
    if (rec?.user?.fullName) return rec.user.fullName;
    const rv = receivableUsers.find((x) => x.id === id);
    if (rv) return rv.fullName;
    return shortId(id);
  }

  async function recordOnBehalf(e: FormEvent) {
    e.preventDefault();
    const rec = recons[recordReconId];
    if (!rec) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/handovers', {
        method: 'POST',
        body: JSON.stringify({
          reconciliationId: rec.id,
          toUserId: recordToUserId,
          notes: recordNotes.trim() === '' ? null : recordNotes.trim(),
          onBehalfOfUserId: rec.userId,
        }),
      });
      setRecordReconId('');
      setRecordToUserId('');
      setRecordNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(id: string) {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/handovers/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          confirmedNotes: confirmNotes.trim() === '' ? undefined : confirmNotes.trim(),
        }),
      });
      setConfirmId(null);
      setConfirmNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Cash Handovers"
        subtitle="Waiter-to-manager cash transfers. Managers confirm receipt."
      />

      {isManager && (
        <form onSubmit={recordOnBehalf} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-700">Record a handover on behalf of a waiter</h2>

          {eligibleRecons.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No eligible reconciliations. A reconciliation must be SUBMITTED or REVIEWED with an actualCash value.
            </div>
          ) : (
            <SelectField
              label="Reconciliation (amount is server-derived from actualCash)"
              value={recordReconId}
              onChange={setRecordReconId}
              required
              options={[
                { value: '', label: 'Select a reconciliation…' },
                ...eligibleRecons.map((r) => ({ value: r.id, label: reconLabel(r) })),
              ]}
            />
          )}

          <SelectField
            label="Receiver"
            value={recordToUserId}
            onChange={setRecordToUserId}
            required
            options={[
              { value: '', label: 'Select a receiver…' },
              ...receivableUsers.map((u) => ({ value: u.id, label: u.fullName + ' (' + u.role + ')' })),
            ]}
          />

          <TextArea label="Notes (optional)" value={recordNotes} onChange={setRecordNotes} rows={2} />

          <SubmitButton busy={busy}>Record handover</SubmitButton>
        </form>
      )}

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
              <th className="text-left px-3 py-2 font-medium">From</th>
              <th className="text-left px-3 py-2 font-medium">To</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Handed over</th>
              <th className="text-left px-3 py-2 font-medium w-48">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && handovers.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No handovers.</td></tr>
            )}
            {handovers.map((h) => (
              <tr key={h.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{businessDate(h)}</td>
                <td className="px-3 py-2">{userName(h.fromUserId)}</td>
                <td className="px-3 py-2">{userName(h.toUserId)}</td>
                <td className="px-3 py-2 text-right font-mono">{h.amount}</td>
                <td className="px-3 py-2">
                  {h.status === 'CONFIRMED'
                    ? <span className="text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5">CONFIRMED</span>
                    : <span className="text-xs rounded bg-amber-100 text-amber-800 px-2 py-0.5">PENDING</span>}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">{h.handedOverAt}</td>
                <td className="px-3 py-2">
                  {h.status === 'PENDING' && isManager && (
                    confirmId === h.id ? (
                      <div className="space-y-1">
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          placeholder="Confirm notes (optional)"
                          value={confirmNotes}
                          onChange={(e) => setConfirmNotes(e.target.value)}
                        />
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => confirm(h.id)}
                            disabled={busy}
                            className="text-xs rounded bg-emerald-600 text-white px-2 py-1 disabled:opacity-60"
                          >
                            {busy ? '…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmId(null); setConfirmNotes(''); }}
                            className="text-xs text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setConfirmId(h.id); setConfirmNotes(''); }}
                        className="text-xs text-emerald-700 underline hover:text-emerald-900"
                      >
                        Confirm receipt
                      </button>
                    )
                  )}
                  {h.status === 'CONFIRMED' && h.confirmedNotes && (
                    <span className="text-xs text-slate-500">{h.confirmedNotes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}