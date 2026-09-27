'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  SelectField, DecimalField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type UserRef = { id: string; fullName: string };

type Shift = {
  id: string;
  userId: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  user: UserRef | null;
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

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function shortId(id: string): string {
  return id.slice(0, 8) + '…';
}

export default function CollectionsPage() {
  const [openShifts, setOpenShifts] = useState<Shift[]>([]);
  const [allShifts, setAllShifts] = useState<Record<string, Shift>>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterShiftId, setFilterShiftId] = useState('');

  const [shiftId, setShiftId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [amount, setAmount] = useState('');
  const [mobileReference, setMobileReference] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function loadOpenShifts() {
    apiFetch<{ success: true; shifts: Shift[] }>('/api/v1/shifts?status=OPEN')
      .then((r) => setOpenShifts(r.shifts))
      .catch(() => setOpenShifts([]));
  }

  function loadAllShifts() {
    apiFetch<{ success: true; shifts: Shift[] }>('/api/v1/shifts')
      .then((r) => {
        const map: Record<string, Shift> = {};
        for (const s of r.shifts) map[s.id] = s;
        setAllShifts(map);
      })
      .catch(() => {});
  }

  function loadCollections() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterShiftId) params.set('shiftId', filterShiftId);
    const qs = params.toString();
    apiFetch<{ success: true; collections: Collection[] }>(
      `/api/v1/collections${qs ? '?' + qs : ''}`
    )
      .then((r) => setCollections(r.collections))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadOpenShifts(); loadAllShifts(); }, []);
  useEffect(() => { loadCollections(); }, [filterShiftId]);

  const selectedShift = openShifts.find((s) => s.id === shiftId);
  const canSubmit = !!selectedShift && amount.trim() !== '' && !busy;

  function shiftLabel(s: Shift): string {
    const who = s.user?.fullName ?? shortId(s.userId);
    return `${s.businessDate} — ${who}`;
  }

  function rowDate(c: Collection): string {
    const s = allShifts[c.shiftId];
    return s ? s.businessDate : shortId(c.shiftId);
  }

  function rowOwner(c: Collection): string {
    const s = allShifts[c.shiftId];
    if (s?.user?.fullName) return s.user.fullName;
    return shortId(c.userId);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selectedShift) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          shiftId: selectedShift.id,
          paymentMethod,
          amount: amount.trim(),
          mobileReference: mobileReference.trim() === '' ? null : mobileReference.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
          onBehalfOfUserId: selectedShift.userId,
        }),
      });
      setAmount('');
      setMobileReference('');
      setNotes('');
      loadCollections();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Collections"
        subtitle="Customer payments recorded against an open shift. Managers record on behalf of the shift's waiter."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <SelectField
            label="Filter by shift"
            value={filterShiftId}
            onChange={setFilterShiftId}
            options={[
              { value: '', label: 'All shifts' },
              ...Object.values(allShifts).map((s) => ({ value: s.id, label: shiftLabel(s) })),
            ]}
          />
        </div>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Record a collection</h2>

        {openShifts.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No OPEN shifts available. A shift must be OPEN to record a collection.
          </div>
        ) : (
          <SelectField
            label="Shift (owner is the attributed waiter)"
            value={shiftId}
            onChange={setShiftId}
            required
            options={[
              { value: '', label: 'Select an open shift…' },
              ...openShifts.map((s) => ({ value: s.id, label: shiftLabel(s) })),
            ]}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SelectField
            label="Payment method"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          />
          <DecimalField
            label="Amount"
            value={amount}
            onChange={setAmount}
            placeholder="0.00"
            required
          />
          <TextField
            label="Mobile reference (optional)"
            value={mobileReference}
            onChange={setMobileReference}
          />
        </div>

        <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />

        {err && <FormError code={err.code} message={err.message} />}

        <div className="flex items-center gap-3">
          <SubmitButton busy={busy}>Record collection</SubmitButton>
          {!canSubmit && selectedShift && (
            <span className="text-xs text-slate-500">Enter an amount to enable submit.</span>
          )}
        </div>

        {selectedShift && (
          <div className="text-xs text-slate-500">
            Attributed to {selectedShift.user?.fullName ?? shortId(selectedShift.userId)} · {selectedShift.businessDate}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Business date</th>
              <th className="text-left px-3 py-2 font-medium">Waiter</th>
              <th className="text-left px-3 py-2 font-medium">Method</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Reference</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && collections.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No collections.</td></tr>
            )}
            {collections.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{rowDate(c)}</td>
                <td className="px-3 py-2">{rowOwner(c)}</td>
                <td className="px-3 py-2">{c.paymentMethod}</td>
                <td className="px-3 py-2 text-right font-mono">{c.amount}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{c.mobileReference ?? '—'}</td>
                <td className="px-3 py-2">
                  {c.voidedAt
                    ? <span className="text-xs rounded bg-red-100 text-red-700 px-2 py-0.5">VOIDED</span>
                    : <span className="text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5">ACTIVE</span>}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">{c.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}