'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SecondarySurfaceBanner } from '@/components/ops/SecondarySurfaceBanner';
import {
  DecimalField, SelectField, TextArea, FormError,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

type Supplier = { id: string; supplierNumber: string; name: string };

type Payment = {
  id: string;
  paymentNumber: string;
  supplierId: string;
  businessDate: string;
  amount: string;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  recordedBy: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Allocation = {
  id: string;
  supplierPaymentId: string;
  purchaseInvoiceId: string;
  amount: string;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  total: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
};

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function SupplierPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const paymentId = params.id;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [allocInvoiceId, setAllocInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [allocBusy, setAllocBusy] = useState(false);

  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const [allocationVoidId, setAllocationVoidId] = useState<string | null>(null);
  const [allocationVoidReason, setAllocationVoidReason] = useState('');

  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    setErr(null);
    apiFetch<{ success: true; payment: Payment; allocations: Allocation[] }>(
      `/api/v1/supplier-payments/${paymentId}`
    )
      .then((res) => {
        setPayment(res.payment);
        setAllocations(res.allocations);
        return Promise.all([
          apiFetch<{ success: true; suppliers: Supplier[] }>('/api/v1/suppliers'),
          apiFetch<{ success: true; invoices: Invoice[] }>(
            `/api/v1/purchase-invoices?supplierId=${res.payment.supplierId}&status=POSTED&unpaidOnly=true`
          ),
        ]);
      })
      .then(([supRes, invRes]) => {
        setSuppliers(supRes.suppliers);
        setInvoices(invRes.invoices);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [paymentId]);

  function supplierName(id: string): string {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.name : id.slice(0, 8);
  }

  function invoiceNumber(id: string): string {
    const inv = invoices.find((x) => x.id === id);
    return inv ? inv.invoiceNumber : id.slice(0, 8);
  }

  const activeAllocations = allocations.filter((a) => !a.voidedAt);
  const totalAllocated = activeAllocations.reduce((s, a) => s + parseFloat(a.amount), 0);
  const paymentAmount = payment ? parseFloat(payment.amount) : 0;
  const remainingOnPayment = paymentAmount - totalAllocated;

  async function allocate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setAllocBusy(true);
    try {
      await apiFetch(`/api/v1/supplier-payments/${paymentId}/allocations`, {
        method: 'POST',
        body: JSON.stringify({ purchaseInvoiceId: allocInvoiceId, amount: allocAmount }),
      });
      setAllocInvoiceId('');
      setAllocAmount('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setAllocBusy(false);
    }
  }

  async function voidPayment() {
    setErr(null);
    setVoidBusy(true);
    try {
      await apiFetch(`/api/v1/supplier-payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      });
      setShowVoid(false);
      setVoidReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setVoidBusy(false);
    }
  }

  async function voidAllocation(allocationId: string) {
    setErr(null);
    try {
      await apiFetch(`/api/v1/payment-allocations/${allocationId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: allocationVoidReason }),
      });
      setAllocationVoidId(null);
      setAllocationVoidReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    }
  }

  if (loading) {
    return (
      <OpsShell>
        <OpsHeader title="Supplier Payment" />
        <div className="text-slate-500">Loading…</div>
      </OpsShell>
    );
  }

  if (!payment) {
    return (
      <OpsShell>
        <OpsHeader title="Supplier Payment" />
        {err && <FormError code={err.code} message={err.message} />}
        <Link href="/ops/purchasing" className="text-sm text-slate-700 underline">
          ← Back to list
        </Link>
      </OpsShell>
    );
  }

  const isVoided = payment.voidedAt !== null;

  return (
    <OpsShell>
      <OpsHeader
        title={`Payment ${payment.paymentNumber}`}
        subtitle={`${supplierName(payment.supplierId)} — ${isVoided ? 'VOIDED' : 'ACTIVE'}`}
      />
      <SecondarySurfaceBanner messageKey='ops.purchasing.secondary.banner' targetHref='/ops/purchasing' targetLabelKey='ops.purchasing.secondary.link' />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/ops/purchasing" className="text-slate-500 hover:text-slate-900">
          ← All payments
        </Link>
        {isVoided
          ? <span className="rounded bg-red-100 text-red-700 px-2 py-0.5 text-xs">VOIDED</span>
          : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">ACTIVE</span>}
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      {/* ---- header info ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Payment</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div><span className="text-slate-500">Supplier: </span>{supplierName(payment.supplierId)}</div>
          <div><span className="text-slate-500">Business date: </span>{payment.businessDate}</div>
          <div><span className="text-slate-500">Method: </span>{payment.paymentMethod}</div>
          <div><span className="text-slate-500">Amount: </span><span className="font-mono">{payment.amount}</span></div>
          <div><span className="text-slate-500">Reference: </span>{payment.reference ?? '—'}</div>
          <div><span className="text-slate-500">Recorded by: </span>{payment.recordedBy.slice(0, 8)}…</div>
        </div>
        {payment.notes && (
          <div className="text-sm text-slate-600">{payment.notes}</div>
        )}
        {isVoided && (
          <div className="text-sm text-red-700">
            Voided at {payment.voidedAt}
            {payment.voidReason && ` — ${payment.voidReason}`}
          </div>
        )}
      </div>

      {/* ---- allocations ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Allocations</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Invoice</th>
                <th className="text-right px-2 py-2 font-medium w-32">Amount</th>
                <th className="text-left px-2 py-2 font-medium">Status</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">No allocations.</td>
                </tr>
              )}
              {allocations.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-mono">{invoiceNumber(a.purchaseInvoiceId)}</td>
                  <td className="px-2 py-2 text-right font-mono">{a.amount}</td>
                  <td className="px-2 py-2">
                    {a.voidedAt
                      ? <span className="text-xs rounded bg-red-100 text-red-700 px-2 py-0.5">VOIDED</span>
                      : <span className="text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5">ACTIVE</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {!a.voidedAt && !isVoided && (
                      allocationVoidId === a.id ? (
                        <div className="space-y-1">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            placeholder="Reason (min 3)"
                            value={allocationVoidReason}
                            onChange={(e) => setAllocationVoidReason(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => voidAllocation(a.id)}
                              disabled={allocationVoidReason.trim().length < 3}
                              className="text-xs rounded bg-red-600 text-white px-2 py-1 disabled:opacity-60"
                            >
                              Void
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAllocationVoidId(null); setAllocationVoidReason(''); }}
                              className="text-xs text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAllocationVoidId(a.id); setAllocationVoidReason(''); }}
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

        <div className="flex flex-wrap gap-6 text-xs text-slate-600">
          <div>Total allocated: <span className="font-mono">{totalAllocated.toFixed(2)}</span></div>
          <div>Remaining on payment: <span className="font-mono">{remainingOnPayment.toFixed(2)}</span></div>
        </div>

        {!isVoided && (
          <form onSubmit={allocate} className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="text-xs font-medium text-slate-600">New allocation</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <SelectField
                label="Invoice (POSTED, unpaid)"
                value={allocInvoiceId}
                onChange={setAllocInvoiceId}
                required
                options={[
                  { value: '', label: '— select —' },
                  ...invoices.map((i) => ({ value: i.id, label: `${i.invoiceNumber} (${i.total})` })),
                ]}
              />
              <DecimalField
                label="Amount"
                value={allocAmount}
                onChange={setAllocAmount}
                required
                placeholder="0.00"
              />
              <div className="flex items-end pb-1">
                <button
                  type="submit"
                  disabled={allocBusy}
                  className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {allocBusy ? 'Allocating…' : 'Allocate'}
                </button>
              </div>
            </div>
            {invoices.length === 0 && (
              <div className="text-xs text-amber-600">
                No unpaid POSTED invoices for this supplier.
              </div>
            )}
          </form>
        )}
      </div>

      {/* ---- void payment ---- */}
      {!isVoided && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-medium text-slate-700">Actions</h2>
          <button
            type="button"
            onClick={() => setShowVoid((v) => !v)}
            className="rounded-lg border border-red-300 text-red-700 px-4 py-2 text-sm"
          >
            {showVoid ? 'Hide void' : 'Void payment'}
          </button>
          {showVoid && (
            <div className="space-y-2">
              <TextArea
                label="Void reason (min 3 chars)"
                value={voidReason}
                onChange={setVoidReason}
                rows={2}
              />
              <div className="text-xs text-slate-500">
                Voiding a payment cascades: all active allocations will also be voided.
              </div>
              <button
                type="button"
                onClick={voidPayment}
                disabled={voidBusy || voidReason.trim().length < 3}
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {voidBusy ? 'Voiding…' : 'Confirm void'}
              </button>
            </div>
          )}
        </div>
      )}
    </OpsShell>
  );
}