'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

type Supplier = { id: string; supplierNumber: string; name: string };

type Material = { id: string; code: string; name: string; isActive: boolean };

type InvoiceItem = {
  id: string;
  purchaseInvoiceId: string;
  materialId: string | null;
  quantity: string;
  unitPrice: string;
  total: string;
  notes: string | null;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  date: string;
  businessDate: string;
  subtotal: string;
  total: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  notes: string | null;
  createdBy: string;
  postedBy: string | null;
  postedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type DraftItem = {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
  notes: string;
};

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

function computeSubtotal(items: DraftItem[]): string {
  let sum = 0;
  for (const it of items) {
    const q = parseFloat(it.quantity);
    const p = parseFloat(it.unitPrice);
    if (!isNaN(q) && !isNaN(p)) sum += q * p;
  }
  return sum.toFixed(2);
}

export default function PurchaseInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [headerBusy, setHeaderBusy] = useState(false);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBusinessDate, setEditBusinessDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  function load() {
    setLoading(true);
    setErr(null);
    Promise.all([
      apiFetch<{ success: true; invoice: Invoice; items: InvoiceItem[] }>(
        `/api/v1/purchase-invoices/${invoiceId}`
      ),
      apiFetch<{ success: true; suppliers: Supplier[] }>('/api/v1/suppliers'),
      apiFetch<{ success: true; materials: Material[] }>('/api/v1/materials'),
    ])
      .then(([invRes, supRes, matRes]) => {
        setInvoice(invRes.invoice);
        setItems(
          invRes.items.map((it) => ({
            key: it.id,
            materialId: it.materialId ?? '',
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            notes: it.notes ?? '',
          }))
        );
        setSuppliers(supRes.suppliers);
        setMaterials(matRes.materials.filter((m) => m.isActive));
        setEditInvoiceNumber(invRes.invoice.invoiceNumber);
        setEditDate(invRes.invoice.date);
        setEditBusinessDate(invRes.invoice.businessDate);
        setEditNotes(invRes.invoice.notes ?? '');
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [invoiceId]);

  function supplierName(id: string): string {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.name : id.slice(0, 8);
  }

  function materialName(id: string | null): string {
    if (!id) return '—';
    const m = materials.find((x) => x.id === id);
    return m ? m.name : id.slice(0, 8);
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: newKey(), materialId: '', quantity: '1', unitPrice: '', notes: '' },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // -------- actions --------

  async function saveHeader(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setHeaderBusy(true);
    try {
      await apiFetch(`/api/v1/purchase-invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          invoiceNumber: editInvoiceNumber,
          date: editDate,
          businessDate: editBusinessDate,
          notes: editNotes.trim() === '' ? null : editNotes.trim(),
        }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setHeaderBusy(false);
    }
  }

  async function saveItems() {
    setErr(null);
    if (items.length === 0) {
      setErr({ code: 'EMPTY', message: 'Add at least one item.' });
      return;
    }
    for (const it of items) {
      if (!it.materialId) {
        setErr({ code: 'MISSING_MATERIAL', message: 'Every item needs a material.' });
        return;
      }
    }
    setItemsBusy(true);
    try {
      await apiFetch(`/api/v1/purchase-invoices/${invoiceId}/items`, {
        method: 'PUT',
        body: JSON.stringify({
          items: items.map((it) => ({
            materialId: it.materialId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            notes: it.notes.trim() === '' ? null : it.notes.trim(),
          })),
        }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setItemsBusy(false);
    }
  }

  async function postInvoice() {
    setErr(null);
    setActionBusy(true);
    try {
      await apiFetch(`/api/v1/purchase-invoices/${invoiceId}/post`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelInvoice() {
    setErr(null);
    setActionBusy(true);
    try {
      await apiFetch(`/api/v1/purchase-invoices/${invoiceId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      setShowCancel(false);
      setCancelReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteInvoice() {
    if (!confirm('Delete this DRAFT invoice permanently?')) return;
    setErr(null);
    setActionBusy(true);
    try {
      await apiFetch(`/api/v1/purchase-invoices/${invoiceId}`, { method: 'DELETE' });
      router.push('/ops/purchase-invoices');
    } catch (e) {
      setErr(errOf(e));
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <OpsShell>
        <OpsHeader title="Purchase Invoice" />
        <div className="text-slate-500">Loading…</div>
      </OpsShell>
    );
  }

  if (!invoice) {
    return (
      <OpsShell>
        <OpsHeader title="Purchase Invoice" />
        {err && <FormError code={err.code} message={err.message} />}
        <Link href="/ops/purchase-invoices" className="text-sm text-slate-700 underline">
          ← Back to list
        </Link>
      </OpsShell>
    );
  }

  const isDraft = invoice.status === 'DRAFT';
  const isPosted = invoice.status === 'POSTED';
  const itemsSum = computeSubtotal(items);

  return (
    <OpsShell>
      <OpsHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={`${supplierName(invoice.supplierId)} — ${invoice.status}`}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/ops/purchase-invoices" className="text-slate-500 hover:text-slate-900">
          ← All invoices
        </Link>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{invoice.status}</span>
        <span className="text-xs text-slate-500">ID {invoice.id.slice(0, 8)}…</span>
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      {/* ---- header form ---- */}
      <form onSubmit={saveHeader} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Header</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <TextField
            label="Invoice number"
            value={editInvoiceNumber}
            onChange={setEditInvoiceNumber}
            required
            disabled={!isDraft}
          />
          <DateField label="Invoice date" value={editDate} onChange={setEditDate} required disabled={!isDraft} />
          <DateField label="Business date" value={editBusinessDate} onChange={setEditBusinessDate} required disabled={!isDraft} />
        </div>
        <TextArea label="Notes" value={editNotes} onChange={setEditNotes} rows={2} disabled={!isDraft} />
        <div className="flex flex-wrap items-center gap-3">
          {isDraft && (
            <SubmitButton busy={headerBusy}>Save header</SubmitButton>
          )}
          <div className="text-xs text-slate-500">
            Subtotal <span className="font-mono">{invoice.subtotal}</span> · Total{' '}
            <span className="font-mono">{invoice.total}</span>
          </div>
        </div>
      </form>

      {/* ---- items editor ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Items</h2>
          {isDraft && (
            <button
              type="button"
              onClick={addItem}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
            >
              + Add item
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Material</th>
                <th className="text-right px-2 py-2 font-medium w-28">Qty</th>
                <th className="text-right px-2 py-2 font-medium w-32">Unit price</th>
                <th className="text-right px-2 py-2 font-medium w-32">Line total</th>
                <th className="text-left px-2 py-2 font-medium">Notes</th>
                {isDraft && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={isDraft ? 6 : 5} className="px-2 py-4 text-center text-slate-400">
                    No items.
                  </td>
                </tr>
              )}
              {items.map((it, idx) => {
                const lineTotal =
                  isNaN(parseFloat(it.quantity)) || isNaN(parseFloat(it.unitPrice))
                    ? '—'
                    : (parseFloat(it.quantity) * parseFloat(it.unitPrice)).toFixed(2);
                return (
                  <tr key={it.key} className="border-t border-slate-100">
                    <td className="px-2 py-2">
                      {isDraft ? (
                        <select
                          className="w-full rounded-lg border border-slate-300 px-2 py-1"
                          value={it.materialId}
                          onChange={(e) => updateItem(idx, { materialId: e.target.value })}
                        >
                          <option value="">— select —</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        materialName(it.materialId || null)
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {isDraft ? (
                        <input
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right font-mono"
                          inputMode="decimal"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        />
                      ) : (
                        <span className="font-mono">{it.quantity}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {isDraft ? (
                        <input
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right font-mono"
                          inputMode="decimal"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                        />
                      ) : (
                        <span className="font-mono">{it.unitPrice}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{lineTotal}</td>
                    <td className="px-2 py-2">
                      {isDraft ? (
                        <input
                          className="w-full rounded-lg border border-slate-300 px-2 py-1"
                          value={it.notes}
                          onChange={(e) => updateItem(idx, { notes: e.target.value })}
                        />
                      ) : (
                        <span className="text-slate-500">{it.notes ?? '—'}</span>
                      )}
                    </td>
                    {isDraft && (
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-xs text-red-600 hover:text-red-800"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Items subtotal <span className="font-mono">{itemsSum}</span>
            {invoice.total !== itemsSum && isDraft && (
              <span className="ml-2 text-amber-600">
                (differs from invoice total — saving items will update it)
              </span>
            )}
          </div>
          {isDraft && (
            <button
              type="button"
              onClick={saveItems}
              disabled={itemsBusy}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {itemsBusy ? 'Saving…' : 'Save items'}
            </button>
          )}
        </div>
      </div>

      {/* ---- actions ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Actions</h2>

        {isDraft && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={postInvoice}
              disabled={actionBusy}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {actionBusy ? 'Working…' : 'Post invoice'}
            </button>
            <button
              type="button"
              onClick={deleteInvoice}
              disabled={actionBusy}
              className="rounded-lg border border-red-300 text-red-700 px-4 py-2 text-sm disabled:opacity-60"
            >
              Delete draft
            </button>
          </div>
        )}

        {isPosted && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowCancel((v) => !v)}
              disabled={actionBusy}
              className="rounded-lg border border-amber-300 text-amber-800 px-4 py-2 text-sm disabled:opacity-60"
            >
              {showCancel ? 'Hide cancel' : 'Cancel invoice'}
            </button>
            {showCancel && (
              <div className="space-y-2">
                <TextArea
                  label="Cancellation reason (min 3 chars)"
                  value={cancelReason}
                  onChange={setCancelReason}
                  rows={2}
                />
                <button
                  type="button"
                  onClick={cancelInvoice}
                  disabled={actionBusy || cancelReason.trim().length < 3}
                  className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {actionBusy ? 'Cancelling…' : 'Confirm cancellation'}
                </button>
              </div>
            )}
          </div>
        )}

        {invoice.status === 'CANCELLED' && (
          <div className="text-sm text-slate-500">
            Cancelled
            {invoice.cancelledAt && ` at ${invoice.cancelledAt}`}
            {invoice.cancelReason && ` — ${invoice.cancelReason}`}
          </div>
        )}

        {!isDraft && !isPosted && invoice.status !== 'CANCELLED' && (
          <div className="text-sm text-slate-500">No actions available for this status.</div>
        )}
      </div>
    </OpsShell>
  );
}