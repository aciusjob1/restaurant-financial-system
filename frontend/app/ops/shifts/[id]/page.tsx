'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DecimalField, SelectField, TextField, TextArea, FormError,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type Shift = {
  id: string;
  userId: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  notes: string | null;
};

type Collection = {
  id: string;
  shiftId: string;
  userId: string;
  paymentMethod: string;
  amount: string;
  mobileReference: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

type User = { id: string; fullName: string; username: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function ShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const shiftId = params.id;

  const [shift, setShift] = useState<Shift | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [mobileReference, setMobileReference] = useState('');
  const [collNotes, setCollNotes] = useState('');

  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [transitionReason, setTransitionReason] = useState('');
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    setErr(null);
    Promise.all([
      apiFetch<{ success: true; shift: Shift }>(`/api/v1/shifts/${shiftId}`),
      apiFetch<{ success: true; collections: Collection[] }>(`/api/v1/collections?shiftId=${shiftId}`),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users'),
    ])
      .then(([sRes, cRes, uRes]) => {
        setShift(sRes.shift);
        setCollections(cRes.collections);
        setUsers(uRes.users);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [shiftId]);

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  async function addCollection(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          shiftId,
          paymentMethod,
          amount,
          mobileReference: mobileReference.trim() === '' ? null : mobileReference.trim(),
          notes: collNotes.trim() === '' ? null : collNotes.trim(),
        }),
      });
      setAmount('');
      setMobileReference('');
      setCollNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function voidCollection() {
    if (!voidId) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/collections/${voidId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidId(null);
      setVoidReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function transition(to: string, reason?: string) {
    setErr(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { to };
      if (reason) body.reason = reason;
      await apiFetch(`/api/v1/shifts/${shiftId}/transition`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPendingTo(null);
      setTransitionReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <OpsShell>
        <OpsHeader title="Shift" />
        <div className="text-slate-500">Loading…</div>
      </OpsShell>
    );
  }

  if (!shift) {
    return (
      <OpsShell>
        <OpsHeader title="Shift" />
        {err && <FormError code={err.code} message={err.message} />}
        <Link href="/ops/shifts" className="text-sm text-slate-700 underline">← Back to list</Link>
      </OpsShell>
    );
  }

  const isOpen = shift.status === 'OPEN';
  const activeCollections = collections.filter((c) => !c.voidedAt);
  const activeTotal = activeCollections.reduce((s, c) => s + parseFloat(c.amount), 0);

  // Status-driven transition options. Mirrors the backend state machine:
  //   OPEN        -> SUBMITTED
  //   SUBMITTED   -> RECONCILING | OPEN  (send back)
  //   RECONCILING -> CLOSED | SUBMITTED  (send back)
  //   CLOSED      -> (terminal)
  // Backend additionally enforces role rules (WAITER has only OPEN -> SUBMITTED).
  const transitions: Array<{ to: string; label: string; variant: 'primary' | 'secondary' }> = [];
  if (shift.status === 'OPEN') {
    transitions.push({ to: 'SUBMITTED', label: 'Submit', variant: 'primary' });
  }
  if (shift.status === 'SUBMITTED') {
    transitions.push({ to: 'RECONCILING', label: 'Move to Reconciling', variant: 'primary' });
    transitions.push({ to: 'OPEN', label: 'Send back to Open', variant: 'secondary' });
  }
  if (shift.status === 'RECONCILING') {
    transitions.push({ to: 'CLOSED', label: 'Close', variant: 'primary' });
    transitions.push({ to: 'SUBMITTED', label: 'Send back to Submitted', variant: 'secondary' });
  }
  // CLOSED is terminal.

  return (
    <OpsShell>
      <OpsHeader
        title={`Shift ${shift.businessDate}`}
        subtitle={`${userName(shift.userId)} — ${shift.status}`}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/ops/shifts" className="text-slate-500 hover:text-slate-900">← All shifts</Link>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{shift.status}</span>
        <span className="text-xs text-slate-500">ID {shift.id.slice(0, 8)}…</span>
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      {/* Shift info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
        <h2 className="text-sm font-medium text-slate-700">Shift</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div><span className="text-slate-500">User: </span>{userName(shift.userId)}</div>
          <div><span className="text-slate-500">Business date: </span>{shift.businessDate}</div>
          <div><span className="text-slate-500">Opening cash: </span><span className="font-mono">{shift.openingCash ?? '—'}</span></div>
          <div><span className="text-slate-500">Started: </span>{shift.startedAt}</div>
          <div><span className="text-slate-500">Submitted: </span>{shift.submittedAt ?? '—'}</div>
          <div><span className="text-slate-500">Closed: </span>{shift.closedAt ?? '—'}</div>
        </div>
        {shift.notes && <div className="text-sm text-slate-600">{shift.notes}</div>}
        {shift.reopenReason && (
          <div className="text-sm text-amber-700">Reopened: {shift.reopenReason}</div>
        )}
      </div>

      {/* Transitions */}
      {transitions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-medium text-slate-700">Transitions</h2>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <button
                key={t.to}
                type="button"
                onClick={() => setPendingTo(t.to)}
                disabled={busy}
                className={
                  t.variant === 'secondary'
                    ? 'rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60'
                    : 'rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          {pendingTo && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <TextArea
                label={`Reason for ${pendingTo} (optional)`}
                value={transitionReason}
                onChange={setTransitionReason}
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => transition(pendingTo, transitionReason)}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {busy ? 'Working…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => { setPendingTo(null); setTransitionReason(''); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
              <div className="text-xs text-slate-500">
                The backend enforces the state machine and role rules; invalid transitions return 409, disallowed roles return 403.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collections */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Collections</h2>
          <div className="text-xs text-slate-500">
            Active total: <span className="font-mono">{activeTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Method</th>
                <th className="text-right px-2 py-2 font-medium w-32">Amount</th>
                <th className="text-left px-2 py-2 font-medium">Reference</th>
                <th className="text-left px-2 py-2 font-medium">By</th>
                <th className="text-left px-2 py-2 font-medium">Status</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                    No collections yet.
                  </td>
                </tr>
              )}
              {collections.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-2 py-2">{c.paymentMethod}</td>
                  <td className="px-2 py-2 text-right font-mono">{c.amount}</td>
                  <td className="px-2 py-2 text-slate-500">{c.mobileReference ?? '—'}</td>
                  <td className="px-2 py-2 text-slate-500">{userName(c.userId)}</td>
                  <td className="px-2 py-2">
                    {c.voidedAt
                      ? <span className="text-xs rounded bg-red-100 text-red-700 px-2 py-0.5">VOIDED</span>
                      : <span className="text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5">ACTIVE</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {!c.voidedAt && isOpen && (
                      voidId === c.id ? (
                        <div className="space-y-1">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            placeholder="Reason"
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                          />
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              onClick={voidCollection}
                              disabled={voidReason.trim().length < 3}
                              className="text-xs rounded bg-red-600 text-white px-2 py-1 disabled:opacity-60"
                            >
                              Void
                            </button>
                            <button
                              type="button"
                              onClick={() => { setVoidId(null); setVoidReason(''); }}
                              className="text-xs text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setVoidId(c.id); setVoidReason(''); }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Void
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isOpen && (
          <form onSubmit={addCollection} className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="text-xs font-medium text-slate-600">Add collection</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <SelectField
                label="Method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                required
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
              />
              <DecimalField
                label="Amount"
                value={amount}
                onChange={setAmount}
                required
                placeholder="0.00"
              />
              <TextField
                label="Mobile reference"
                value={mobileReference}
                onChange={setMobileReference}
                placeholder="e.g. MPESA code"
              />
              <div className="flex items-end pb-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {busy ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
            <TextArea label="Notes (optional)" value={collNotes} onChange={setCollNotes} rows={2} />
            <div className="text-xs text-slate-500">
              Note: collection creation is WAITER-only in the backend. If you are logged in as
              OWNER/MANAGER this will be rejected with 403. That is a known permission tension
              to revisit when the Kiosk UI (Phase 18) lands.
            </div>
          </form>
        )}
      </div>
    </OpsShell>
  );
}