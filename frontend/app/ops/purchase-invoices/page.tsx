'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'POSTED', 'CANCELLED'] as const;

type Supplier = { id: string; supplierNumber: string; name: string; isActive: boolean };

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
  createdAt: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function PurchaseInvoicesPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(todayISO());
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function loadInvoices() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSupplierId) params.set('supplierId', filterSupplierId);
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    const qs = params.toString();
    apiFetch<{ success: true; invoices: Invoice[] }>(`/api/v1/purchase-invoices${qs ? '?' + qs : ''}`)
      .then((r) => setInvoices(r.invoices))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; suppliers: Supplier[] }>('/api/v1/suppliers')
      .then((r) => setSuppliers(r.suppliers.filter((s) => s.isActive)))
      .catch((e) => setErr(errOf(e)));
  }, []);

  useEffect(() => { loadInvoices(); }, [filterSupplierId, filterStatus]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/purchase-invoices', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          invoiceNumber,
          date,
          businessDate,
          total,
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setInvoiceNumber('');
      setTotal('');
      setNotes('');
      loadInvoices();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  function supplierName(id: string): string {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.name : id.slice(0, 8);
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Purchase Invoices"
        subtitle="Create a draft invoice, add items, then post to create stock movements and a financial obligation."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="w-64">
          <SelectField
            label="Filter by supplier"
            value={filterSupplierId}
            onChange={setFilterSupplierId}
            options={[
              { value: '', label: '— all suppliers —' },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div className="w-48">
          <SelectField
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">New draft invoice</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <SelectField
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            required
            options={[
              { value: '', label: '— select —' },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <TextField
            label="Invoice number"
            value={invoiceNumber}
            onChange={setInvoiceNumber}
            required
            placeholder="e.g. INV-2024-001"
          />
          <DateField label="Invoice date" value={date} onChange={setDate} required />
          <DateField label="Business date" value={businessDate} onChange={setBusinessDate} required />
          <DecimalField
            label="Total (placeholder)"
            value={total}
            onChange={setTotal}
            required
            placeholder="0.00"
          />
        </div>
        <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />
        <div className="text-xs text-slate-500">
          The invoice total must equal the sum of item totals before posting. You can set a
          placeholder now and finalise it in the items editor.
        </div>
        {err && <FormError code={err.code} message={err.message} />}
        <SubmitButton busy={busy}>Create draft</SubmitButton>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Invoice #</th>
              <th className="text-left px-3 py-2 font-medium">Supplier</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-right px-3 py-2 font-medium">Total</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No invoices.</td></tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{inv.invoiceNumber}</td>
                <td className="px-3 py-2">{supplierName(inv.supplierId)}</td>
                <td className="px-3 py-2">{inv.date}</td>
                <td className="px-3 py-2 text-right font-mono">{inv.total}</td>
                <td className="px-3 py-2">
                  <span className="text-xs rounded bg-slate-100 px-2 py-0.5">{inv.status}</span>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/ops/purchase-invoices/${inv.id}`}
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