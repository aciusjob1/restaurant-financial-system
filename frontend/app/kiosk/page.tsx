'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { KioskShell, KioskHeader } from '@/components/kiosk/KioskShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type Me = { id: string; fullName: string; role: string };

type Shift = {
  id: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  notes: string | null;
};

type Collection = {
  id: string;
  shiftId: string;
  paymentMethod: string;
  amount: string;
  mobileReference: string | null;
  voidedAt: string | null;
};

type Reconciliation = {
  id: string;
  shiftId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  expectedCash: string;
  expectedMobile: string;
  actualCash: string | null;
  actualMobile: string | null;
  cashDifference: string | null;
  mobileDifference: string | null;
};

type Handover = {
  id: string;
  reconciliationId: string;
  amount: string;
  status: 'PENDING' | 'CONFIRMED';
  toUserId: string;
  confirmedAt: string | null;
};

type Receiver = { id: string; fullName: string; role: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function KioskPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [closedToday, setClosedToday] = useState(false);

  // Start-shift form
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [openingCash, setOpeningCash] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');

  // Collection form
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [amount, setAmount] = useState('');
  const [mobileReference, setMobileReference] = useState('');
  const [collNotes, setCollNotes] = useState('');

  // Reconciliation form
  const [actualCash, setActualCash] = useState('');
  const [actualMobile, setActualMobile] = useState('');
  const [reconNotes, setReconNotes] = useState('');

  // Handover form
  const [receiverId, setReceiverId] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const meRes = await apiFetch<{ success: true; user: Me }>('/api/v1/auth/me');
      setMe(meRes.user);

      const shiftsRes = await apiFetch<{ success: true; shifts: Shift[] }>('/api/v1/shifts');
      const active = shiftsRes.shifts.find((s) => s.status !== 'CLOSED') || null;
      setShift(active);
      const today = todayISO();
      setClosedToday(!active && shiftsRes.shifts.some((s) => s.status === 'CLOSED' && s.businessDate === today));

      if (!active) {
        setCollections([]);
        setRecon(null);
        setHandover(null);
        setReceivers([]);
        return;
      }

      const cRes = await apiFetch<{ success: true; collections: Collection[] }>(
        `/api/v1/collections?shiftId=${active.id}`
      );
      setCollections(cRes.collections);

      const rRes = await apiFetch<{ success: true; reconciliations: Reconciliation[] }>(
        `/api/v1/reconciliations?shiftId=${active.id}`
      );
      const r = rRes.reconciliations[0] || null;
      setRecon(r);

      if (r) {
        // Only seed the actuals inputs if they aren't already set by the user.
        setActualCash((prev) => (prev === '' ? (r.actualCash ?? '') : prev));
        setActualMobile((prev) => (prev === '' ? (r.actualMobile ?? '') : prev));
      } else {
        setActualCash('');
        setActualMobile('');
      }

      if (r) {
        const hRes = await apiFetch<{ success: true; handovers: Handover[] }>(
          `/api/v1/handovers?reconciliationId=${r.id}`
        );
        setHandover(hRes.handovers[0] || null);
      } else {
        setHandover(null);
      }

      // Fetch receivers only when we're actually at the handover-creation step.
      if (r && (r.status === 'SUBMITTED' || r.status === 'REVIEWED')) {
        const uRes = await apiFetch<{ success: true; users: Receiver[] }>(
          '/api/v1/handovers/receivable-users'
        );
        setReceivers(uRes.users);
      } else {
        setReceivers([]);
      }
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // -------- derived state --------
  type KioskState =
    | { kind: 'loading' }
    | { kind: 'no-shift' }
    | { kind: 'day-done' }
    | { kind: 'shift-open' }
    | { kind: 'shift-submitted-no-recon' }
    | { kind: 'recon-draft' }
    | { kind: 'recon-submitted-no-handover' }
    | { kind: 'handover-pending' }
    | { kind: 'handover-confirmed' }
    | { kind: 'waiting-manager'; message: string };

  const state: KioskState = (() => {
    if (loading) return { kind: 'loading' };
    if (!shift) return closedToday ? { kind: 'day-done' } : { kind: 'no-shift' };
    if (shift.status === 'OPEN') return { kind: 'shift-open' };
    if (shift.status === 'RECONCILING') {
      return { kind: 'waiting-manager', message: 'Waiting for manager to move the shift forward.' };
    }
    // SUBMITTED
    if (!recon) return { kind: 'shift-submitted-no-recon' };
    if (recon.status === 'DRAFT') return { kind: 'recon-draft' };
    // recon SUBMITTED or REVIEWED
    if (!handover) return { kind: 'recon-submitted-no-handover' };
    if (handover.status === 'PENDING') return { kind: 'handover-pending' };
    return { kind: 'handover-confirmed' };
  })();

  // -------- actions --------

  async function startShift(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/shifts', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          openingCash: openingCash.trim(),
          notes: shiftNotes.trim() === '' ? null : shiftNotes.trim(),
        }),
      });
      setOpeningCash('');
      setShiftNotes('');
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function addCollection(e: FormEvent) {
    e.preventDefault();
    if (!shift) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          shiftId: shift.id,
          paymentMethod,
          amount,
          mobileReference: mobileReference.trim() === '' ? null : mobileReference.trim(),
          notes: collNotes.trim() === '' ? null : collNotes.trim(),
        }),
      });
      setAmount('');
      setMobileReference('');
      setCollNotes('');
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitShift() {
    if (!shift) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/shifts/${shift.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to: 'SUBMITTED' }),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createReconciliation() {
    if (!shift) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations', {
        method: 'POST',
        body: JSON.stringify({ shiftId: shift.id }),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveActuals(e: FormEvent) {
    e.preventDefault();
    if (!recon) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/reconciliations/${recon.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actualCash,
          actualMobile,
          notes: reconNotes.trim() === '' ? null : reconNotes.trim(),
        }),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReconciliation() {
    if (!recon) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/reconciliations/${recon.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createHandover(e: FormEvent) {
    e.preventDefault();
    if (!recon) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/handovers', {
        method: 'POST',
        body: JSON.stringify({
          reconciliationId: recon.id,
          toUserId: receiverId,
          notes: handoverNotes.trim() === '' ? null : handoverNotes.trim(),
        }),
      });
      setHandoverNotes('');
      setReceiverId('');
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  // -------- derived display values --------

  const activeCollections = collections.filter((c) => !c.voidedAt);
  const collectionsTotal = activeCollections.reduce((s, c) => s + parseFloat(c.amount), 0);

  function receiverName(id: string): string {
    const r = receivers.find((x) => x.id === id);
    return r ? r.fullName : id.slice(0, 8);
  }

  // -------- render --------

  if (state.kind === 'loading') {
    return (
      <KioskShell>
        <KioskHeader title="Kiosk" subtitle="Loading your shift…" />
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <KioskHeader
        title={me ? `Hello, ${me.fullName.split(' ')[0]}` : 'Kiosk'}
        subtitle="Follow the steps below. The system will show the next action."
      />

      {err && <FormError code={err.code} message={err.message} />}

      {state.kind === 'no-shift' && (
        <form onSubmit={startShift} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-base font-medium text-slate-900">Start your shift</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DateField label="Business date" value={businessDate} onChange={setBusinessDate} required />
            <DecimalField label="Opening cash" value={openingCash} onChange={setOpeningCash} placeholder="0.00" required />
          </div>
          <TextArea label="Notes (optional)" value={shiftNotes} onChange={setShiftNotes} rows={2} />
          <SubmitButton busy={busy}>Start shift</SubmitButton>
        </form>
      )}

      {state.kind === 'day-done' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 space-y-2">
          <div className="text-lg font-medium">Day complete.</div>
          <div className="text-sm">Your shift for today is closed. Sign out when ready for the next person.</div>
        </div>
      )}

      {state.kind === 'shift-open' && shift && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-slate-900">Shift open</h2>
              <span className="text-xs text-slate-500">Started {shift.startedAt}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-slate-500">Date: </span>{shift.businessDate}</div>
              <div><span className="text-slate-500">Opening cash: </span><span className="font-mono">{shift.openingCash ?? '—'}</span></div>
              <div><span className="text-slate-500">Collections total: </span><span className="font-mono">{collectionsTotal.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-medium text-slate-900">Collections</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Method</th>
                    <th className="text-right px-2 py-2 font-medium">Amount</th>
                    <th className="text-left px-2 py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.length === 0 && (
                    <tr><td colSpan={3} className="px-2 py-3 text-center text-slate-400">No collections yet.</td></tr>
                  )}
                  {collections.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-2 py-2">{c.paymentMethod}</td>
                      <td className="px-2 py-2 text-right font-mono">{c.amount}</td>
                      <td className="px-2 py-2 text-slate-500">
                        {c.mobileReference ?? '—'}
                        {c.voidedAt && <span className="ml-2 text-xs text-red-600">VOIDED</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={addCollection} className="border-t border-slate-100 pt-3 space-y-3">
              <h3 className="text-xs font-medium text-slate-600">Add collection</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SelectField
                  label="Method"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  required
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
                />
                <DecimalField label="Amount" value={amount} onChange={setAmount} required placeholder="0.00" />
                <TextField
                  label="Mobile ref (optional)"
                  value={mobileReference}
                  onChange={setMobileReference}
                  placeholder="e.g. MPESA code"
                />
              </div>
              <TextArea label="Notes (optional)" value={collNotes} onChange={setCollNotes} rows={2} />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {busy ? 'Adding…' : 'Add collection'}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-medium text-slate-900">Ready to finish?</h2>
            <div className="text-sm text-slate-600">
              Submit the shift when you have recorded all collections. A manager will move it to reconciliation.
            </div>
            {shift.openingCash === null && (
              <div className="text-xs text-amber-700">
                Opening cash was not declared when the shift started. It may be needed before submission.
              </div>
            )}
            <button
              type="button"
              onClick={submitShift}
              disabled={busy}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Submit shift'}
            </button>
          </div>
        </>
      )}

      {state.kind === 'shift-submitted-no-recon' && shift && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-medium text-slate-900">Shift submitted</h2>
          <div className="text-sm text-slate-600">
            Next: create a reconciliation. The system will show expected cash and mobile based on your collections.
          </div>
          <button
            type="button"
            onClick={createReconciliation}
            disabled={busy}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create reconciliation'}
          </button>
        </div>
      )}

      {state.kind === 'recon-draft' && recon && (
        <form onSubmit={saveActuals} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-base font-medium text-slate-900">Enter actual cash and mobile</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Expected cash</div>
              <div className="font-mono">{recon.expectedCash}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Expected mobile</div>
              <div className="font-mono">{recon.expectedMobile}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DecimalField label="Actual cash" value={actualCash} onChange={setActualCash} required placeholder="0.00" />
            <DecimalField label="Actual mobile" value={actualMobile} onChange={setActualMobile} required placeholder="0.00" />
          </div>
          <TextArea label="Notes (optional)" value={reconNotes} onChange={setReconNotes} rows={2} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save actuals'}
            </button>
            <button
              type="button"
              onClick={submitReconciliation}
              disabled={busy || actualCash.trim() === '' || actualMobile.trim() === ''}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
          <div className="text-xs text-slate-500">
            Both actual cash and actual mobile must be set before submitting.
          </div>
        </form>
      )}

      {state.kind === 'recon-submitted-no-handover' && recon && (
        <form onSubmit={createHandover} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-base font-medium text-slate-900">Hand over the cash</h2>
          <div className="text-sm text-slate-600">
            The amount is derived from your reconciliation — you cannot set it.
            Choose a manager or owner to receive it.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SelectField
              label="Receiver"
              value={receiverId}
              onChange={setReceiverId}
              required
              options={[
                { value: '', label: '— select —' },
                ...receivers.map((r) => ({ value: r.id, label: `${r.fullName} (${r.role})` })),
              ]}
            />
          </div>
          <TextArea label="Notes (optional)" value={handoverNotes} onChange={setHandoverNotes} rows={2} />
          <button
            type="submit"
            disabled={busy || receiverId === ''}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create handover'}
          </button>
          {receivers.length === 0 && (
            <div className="text-xs text-amber-700">
              No eligible receivers found. Ask a manager to check their account is active.
            </div>
          )}
        </form>
      )}

      {state.kind === 'handover-pending' && handover && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 space-y-2">
          <div className="text-lg font-medium">Waiting for manager</div>
          <div className="text-sm">
            Handover of <span className="font-mono">{handover.amount}</span> to {receiverName(handover.toUserId)} is pending confirmation.
          </div>
          <div className="text-xs">Refresh this page to check again.</div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="mt-2 rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      {state.kind === 'handover-confirmed' && handover && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 space-y-2">
          <div className="text-lg font-medium">Handover confirmed</div>
          <div className="text-sm">
            <span className="font-mono">{handover.amount}</span> received by {receiverName(handover.toUserId)}.
          </div>
          <div className="text-xs">Waiting for a manager to close the shift. Refresh to check.</div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="mt-2 rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      {state.kind === 'waiting-manager' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 space-y-2">
          <div className="text-lg font-medium text-slate-900">Waiting for manager</div>
          <div className="text-sm">{state.message}</div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}
    </KioskShell>
  );
}