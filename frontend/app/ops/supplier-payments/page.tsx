'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SecondarySurfaceBanner } from '@/components/ops/SecondarySurfaceBanner';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type Supplier = { id: string; supplierNumber: string; name: string; isActive: boolean };

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
  voidReason: string | null;
  createdAt: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function SupplierPaymentsPage() {
  const { t, tError } = useT();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function loadPayments() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSupplierId) params.set('supplierId', filterSupplierId);
    if (includeVoided) params.set('includeVoided', 'true');
    const qs = params.toString();
    apiFetch<{ success: true; payments: Payment[] }>('/api/v1/supplier-payments' + (qs ? '?' + qs : ''))
      .then((r) => setPayments(r.payments))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; suppliers: Supplier[] }>('/api/v1/suppliers')
      .then((r) => setSuppliers(r.suppliers.filter((s) => s.isActive)))
      .catch((e) => setErr(errOf(e)));
  }, []);

  useEffect(() => { loadPayments(); }, [filterSupplierId, includeVoided]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          businessDate,
          amount,
          paymentMethod,
          reference: reference.trim() === '' ? null : reference.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setAmount('');
      setReference('');
      setNotes('');
      loadPayments();
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
        title={t('ops.supplierPayments.title')}
        subtitle={t('ops.supplierPayments.subtitle')}
      />
      <SecondarySurfaceBanner messageKey='ops.purchasing.secondary.banner' targetHref='/ops/purchasing' targetLabelKey='ops.purchasing.secondary.link' />

      <div className='flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4'>
        <div className='w-64'>
          <SelectField
            label={t('form.filterBySupplier')}
            value={filterSupplierId}
            onChange={setFilterSupplierId}
            options={[
              { value: '', label: t('common.allSuppliers') },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <label className='flex items-center gap-2 text-sm text-slate-700 pb-2'>
          <input
            type='checkbox'
            checked={includeVoided}
            onChange={(e) => setIncludeVoided(e.target.checked)}
          />
          {t('common.includeVoided')}
        </label>
      </div>

      <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.supplierPayments.recordHeading')}</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          <SelectField
            label={t('table.supplier')}
            value={supplierId}
            onChange={setSupplierId}
            required
            options={[
              { value: '', label: t('form.selectPrompt') },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
          <DecimalField label={t('form.amount')} value={amount} onChange={setAmount} required placeholder='0.00' />
          <SelectField
            label={t('form.paymentMethod')}
            value={paymentMethod}
            onChange={setPaymentMethod}
            required
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
          />
          <TextField label={t('form.referenceOptional')} value={reference} onChange={setReference} placeholder={t('ops.supplierPayments.referencePlaceholder')} />
        </div>
        <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <SubmitButton busy={busy}>{t('action.recordPayment')}</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>{t('table.paymentNumber')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.supplier')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.date')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.amount')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.method')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && payments.length === 0 && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('ops.supplierPayments.empty')}</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className='border-t border-slate-100'>
                <td className='px-3 py-2 font-mono'>{p.paymentNumber}</td>
                <td className='px-3 py-2'>{supplierName(p.supplierId)}</td>
                <td className='px-3 py-2'>{p.businessDate}</td>
                <td className='px-3 py-2 text-right font-mono'>{p.amount}</td>
                <td className='px-3 py-2'>{p.paymentMethod}</td>
                <td className='px-3 py-2'>
                  {p.voidedAt
                    ? <span className='text-xs rounded bg-red-100 text-red-700 px-2 py-0.5'>{t('status.voided')}</span>
                    : <span className='text-xs rounded bg-slate-100 px-2 py-0.5'>{t('status.active')}</span>}
                </td>
                <td className='px-3 py-2'>
                  <Link
                    href={'/ops/supplier-payments/' + p.id}
                    className='text-xs text-slate-700 underline hover:text-slate-900'
                  >
                    {t('action.open')}
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
