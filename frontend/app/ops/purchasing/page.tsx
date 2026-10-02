'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Supplier = { id: string; supplierNumber: string; name: string; isActive: boolean };
type Material = { id: string; materialNumber: string; name: string; isActive: boolean };
type Invoice = { id: string; invoiceNumber: string; total: string; businessDate: string };
type InvoiceFull = {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  date: string;
  total: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
};
type Payment = {
  id: string;
  paymentNumber: string;
  supplierId: string;
  businessDate: string;
  amount: string;
  voidedAt: string | null;
};
type PanelKey = 'purchase' | 'pay' | 'activity';
type ActivityRow = {
  id: string;
  kind: 'purchase' | 'payment';
  date: string;
  reference: string;
  supplierId: string;
  amount: string;
  status: string;
  href: string | null;
};

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type DraftItem = {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
  notes: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

function moneySum(items: DraftItem[]): string {
  let sum = 0;
  for (const it of items) {
    const q = parseFloat(it.quantity);
    const p = parseFloat(it.unitPrice);
    if (!isNaN(q) && !isNaN(p)) sum += q * p;
  }
  return sum.toFixed(2);
}

type SectionProps = {
  open: boolean;
  onToggle: () => void;
  heading: string;
  intro: string;
  children: React.ReactNode;
};

function CollapsibleSection({ open, onToggle, heading, intro, children }: SectionProps) {
  return (
    <section className='rounded-2xl border border-slate-200 bg-white'>
      <button
        type='button'
        onClick={onToggle}
        className='w-full flex items-start justify-between gap-3 p-5 text-left'
      >
        <div>
          <h2 className='text-base font-medium text-slate-900'>{heading}</h2>
          <p className='text-xs text-slate-500 mt-1'>{intro}</p>
        </div>
        <span className='text-slate-400 text-lg leading-none shrink-0'>{open ? '\u2212' : '+'}</span>
      </button>
      {open && <div className='px-5 pb-5 space-y-4'>{children}</div>}
    </section>
  );
}

export default function PurchasingPage() {
  const { t, tError } = useT();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [openPanel, setOpenPanel] = useState<PanelKey | null>('purchase');
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // record purchase state
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [purchaseBusy, setPurchaseBusy] = useState<'draft' | 'post' | null>(null);

  // inline create supplier
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierBusy, setNewSupplierBusy] = useState(false);

  // pay supplier state
  const [paySupplierId, setPaySupplierId] = useState('');
  const [outstanding, setOutstanding] = useState<Invoice[]>([]);
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>('CASH');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payBusinessDate, setPayBusinessDate] = useState(todayISO());
  const [autoAllocate, setAutoAllocate] = useState(true);
  const [manualInvoiceIds, setManualInvoiceIds] = useState<string[]>([]);
  const [payBusy, setPayBusy] = useState(false);

  function loadFixtures() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; suppliers: Supplier[] }>('/api/v1/suppliers'),
      apiFetch<{ success: true; materials: Material[] }>('/api/v1/materials'),
    ])
      .then(([supRes, matRes]) => {
        setSuppliers(supRes.suppliers.filter((s) => s.isActive));
        setMaterials(matRes.materials.filter((m) => m.isActive));
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFixtures(); }, []);

  function loadActivity() {
    setActivityLoading(true);
    Promise.all([
      apiFetch<{ success: true; invoices: InvoiceFull[] }>('/api/v1/purchase-invoices'),
      apiFetch<{ success: true; payments: Payment[] }>('/api/v1/supplier-payments?includeVoided=true'),
    ])
      .then(([invRes, payRes]) => {
        const purchases: ActivityRow[] = invRes.invoices.map((inv) => ({
          id: 'p:' + inv.id,
          kind: 'purchase' as const,
          date: inv.date,
          reference: inv.invoiceNumber,
          supplierId: inv.supplierId,
          amount: inv.total,
          status: inv.status,
          href: null,
        }));
        const payments: ActivityRow[] = payRes.payments.map((p) => ({
          id: 'y:' + p.id,
          kind: 'payment' as const,
          date: p.businessDate,
          reference: p.paymentNumber,
          supplierId: p.supplierId,
          amount: p.amount,
          status: p.voidedAt ? 'VOIDED' : 'ACTIVE',
          href: null,
        }));
        const merged = [...purchases, ...payments]
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          .slice(0, 15);
        setActivity(merged);
      })
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false));
  }

  useEffect(() => { loadActivity(); }, []);

  useEffect(() => {
    if (!paySupplierId) { setOutstanding([]); return; }
    setOutstandingLoading(true);
    apiFetch<{ success: true; invoices: Invoice[] }>(
      '/api/v1/purchase-invoices?supplierId=' + paySupplierId + '&status=POSTED&unpaidOnly=true'
    )
      .then((res) => setOutstanding(res.invoices))
      .catch(() => setOutstanding([]))
      .finally(() => setOutstandingLoading(false));
  }, [paySupplierId]);

  const subtotal = useMemo(() => moneySum(items), [items]);

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: newKey(), materialId: '', quantity: '1', unitPrice: '', notes: '' },
    ]);
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetPurchaseForm() {
    setInvoiceNumber('');
    setNotes('');
    setItems([]);
  }

  async function submitPurchase(postNow: boolean) {
    setErr(null);
    setFlash(null);
    if (!supplierId) { setErr({ code: 'SUPPLIER_REQUIRED', message: 'Select a supplier.' }); return; }
    if (!invoiceNumber.trim()) { setErr({ code: 'INVOICE_NUMBER_REQUIRED', message: 'Invoice number is required.' }); return; }
    if (items.length === 0) { setErr({ code: 'ITEMS_REQUIRED', message: 'Add at least one item.' }); return; }
    for (const it of items) {
      if (!it.materialId) { setErr({ code: 'MATERIAL_REQUIRED', message: 'Every item needs a material.' }); return; }
      if (!it.quantity.trim() || !it.unitPrice.trim()) { setErr({ code: 'ITEM_INCOMPLETE', message: 'Every item needs quantity and unit price.' }); return; }
    }
    setPurchaseBusy(postNow ? 'post' : 'draft');
    try {
      await apiFetch('/api/v1/purchase-invoices/complete', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          invoiceNumber: invoiceNumber.trim(),
          date: invoiceDate,
          businessDate,
          notes: notes.trim() === '' ? null : notes.trim(),
          postNow,
          items: items.map((it) => ({
            materialId: it.materialId,
            quantity: it.quantity.trim(),
            unitPrice: it.unitPrice.trim(),
            notes: it.notes.trim() === '' ? null : it.notes.trim(),
          })),
        }),
      });
      resetPurchaseForm();
      setFlash(postNow ? t('ops.purchasing.flash.purchasePosted') : t('ops.purchasing.flash.purchaseDraft'));
      loadActivity();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setPurchaseBusy(null);
    }
  }

  async function createSupplierInline(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setFlash(null);
    setNewSupplierBusy(true);
    try {
      const res = await apiFetch<{ success: true; supplier: Supplier }>('/api/v1/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: newSupplierName.trim(),
          phone: newSupplierPhone.trim() === '' ? null : newSupplierPhone.trim(),
        }),
      });
      setNewSupplierName('');
      setNewSupplierPhone('');
      setShowNewSupplier(false);
      setFlash(t('ops.purchasing.flash.supplierCreated'));
      await loadFixtures();
      setSupplierId(res.supplier.id);
      setPaySupplierId(res.supplier.id);
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setNewSupplierBusy(false);
    }
  }

  function toggleManualInvoice(id: string) {
    setManualInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setFlash(null);
    if (!paySupplierId) { setErr({ code: 'SUPPLIER_REQUIRED', message: 'Select a supplier.' }); return; }
    if (!payAmount.trim()) { setErr({ code: 'AMOUNT_REQUIRED', message: 'Amount is required.' }); return; }
    if (!autoAllocate && manualInvoiceIds.length === 0) {
      setErr({ code: 'INVOICE_REQUIRED', message: 'Select at least one invoice.' });
      return;
    }
    setPayBusy(true);
    try {
      const body: Record<string, unknown> = {
        supplierId: paySupplierId,
        businessDate: payBusinessDate,
        amount: payAmount.trim(),
        paymentMethod: payMethod,
        reference: payReference.trim() === '' ? null : payReference.trim(),
        notes: payNotes.trim() === '' ? null : payNotes.trim(),
      };
      if (!autoAllocate) {
        body.allocateTo = manualInvoiceIds;
      } else {
        body.autoAllocate = true;
      }
      await apiFetch('/api/v1/supplier-payments/complete', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPayAmount('');
      setPayReference('');
      setPayNotes('');
      setManualInvoiceIds([]);
      setFlash(t('ops.purchasing.flash.paymentRecorded'));
      loadActivity();
      const res = await apiFetch<{ success: true; invoices: Invoice[] }>(
        '/api/v1/purchase-invoices?supplierId=' + paySupplierId + '&status=POSTED&unpaidOnly=true'
      );
      setOutstanding(res.invoices);
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setPayBusy(false);
    }
  }

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name + ' (' + s.supplierNumber + ')' }));
  const materialOptions = materials.map((m) => ({ value: m.id, label: m.name }));

  return (
    <OpsShell>
      <OpsHeader title={t('ops.purchasing.title')} subtitle={t('ops.purchasing.subtitle')} />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {flash}
        </div>
      )}

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
        <>
          <CollapsibleSection
            open={openPanel === 'purchase'}
            onToggle={() => setOpenPanel((v) => (v === 'purchase' ? null : 'purchase'))}
            heading={t('ops.purchasing.recordHeading')}
            intro={t('ops.purchasing.purchaseIntro')}
          >
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
              <div className='space-y-2'>
                <SelectField
                  label={t('table.supplier')}
                  value={supplierId}
                  onChange={setSupplierId}
                  options={[
                    { value: '', label: t('ops.purchasing.selectSupplierPrompt') },
                    ...supplierOptions,
                  ]}
                />
                <button
                  type='button'
                  onClick={() => setShowNewSupplier((v) => !v)}
                  className='text-xs text-slate-600 underline hover:text-slate-900'
                >
                  {t('ops.purchasing.newSupplierToggle')}
                </button>
              </div>
              <TextField
                label={t('ops.purchaseInvoices.invoiceNumberPlaceholder')}
                value={invoiceNumber}
                onChange={setInvoiceNumber}
              />
              <DateField label={t('form.invoiceDate')} value={invoiceDate} onChange={setInvoiceDate} required />
              <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
            </div>

            {showNewSupplier && (
              <form onSubmit={createSupplierInline} className='rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <TextField
                    label={t('ops.purchasing.newSupplierName')}
                    value={newSupplierName}
                    onChange={setNewSupplierName}
                    required
                  />
                  <TextField
                    label={t('ops.purchasing.newSupplierPhone')}
                    value={newSupplierPhone}
                    onChange={setNewSupplierPhone}
                  />
                </div>
                <div className='flex gap-2'>
                  <SubmitButton busy={newSupplierBusy}>{t('ops.purchasing.newSupplierSubmit')}</SubmitButton>
                  <button
                    type='button'
                    onClick={() => { setShowNewSupplier(false); setNewSupplierName(''); setNewSupplierPhone(''); }}
                    className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'
                  >
                    {t('ops.purchasing.newSupplierCancel')}
                  </button>
                </div>
              </form>
            )}

            <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />

            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-medium text-slate-700'>{t('ops.purchasing.itemsHeading')}</h3>
                <button
                  type='button'
                  onClick={addItem}
                  className='rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50'
                >
                  {t('ops.purchasing.addItem')}
                </button>
              </div>

              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead className='bg-slate-50'>
                    <tr>
                      <th className='text-left px-2 py-2 font-medium'>{t('ops.purchasing.materialCol')}</th>
                      <th className='text-right px-2 py-2 font-medium w-24'>{t('ops.purchasing.qtyCol')}</th>
                      <th className='text-right px-2 py-2 font-medium w-32'>{t('ops.purchasing.unitPriceCol')}</th>
                      <th className='text-right px-2 py-2 font-medium w-28'>{t('ops.purchasing.lineTotalCol')}</th>
                      <th className='w-10' />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className='px-2 py-4 text-center text-slate-400'>
                          {t('ops.purchasing.emptyItems')}
                        </td>
                      </tr>
                    )}
                    {items.map((it, idx) => {
                      const q = parseFloat(it.quantity);
                      const p = parseFloat(it.unitPrice);
                      const line = (!isNaN(q) && !isNaN(p)) ? (q * p).toFixed(2) : '\u2014';
                      return (
                        <tr key={it.key} className='border-t border-slate-100'>
                          <td className='px-2 py-2'>
                            <select
                              className='w-full rounded-lg border border-slate-300 px-2 py-1'
                              value={it.materialId}
                              onChange={(e) => updateItem(idx, { materialId: e.target.value })}
                            >
                              <option value=''>{t('ops.purchasing.selectMaterialPrompt')}</option>
                              {materialOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className='px-2 py-2'>
                            <input
                              className='w-20 rounded-lg border border-slate-300 px-2 py-1 text-right font-mono'
                              inputMode='decimal'
                              value={it.quantity}
                              onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                            />
                          </td>
                          <td className='px-2 py-2'>
                            <input
                              className='w-28 rounded-lg border border-slate-300 px-2 py-1 text-right font-mono'
                              inputMode='decimal'
                              value={it.unitPrice}
                              onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                            />
                          </td>
                          <td className='px-2 py-2 text-right font-mono text-slate-700'>{line}</td>
                          <td className='px-2 py-2 text-center'>
                            <button
                              type='button'
                              onClick={() => removeItem(idx)}
                              className='text-xs text-red-600 hover:text-red-800'
                            >
                              {'\u2715'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className='flex items-center justify-between border-t border-slate-100 pt-3'>
              <div className='text-sm text-slate-700'>
                {t('ops.purchasing.subtotalLabel')}: <span className='font-mono'>{subtotal}</span>
              </div>
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={() => submitPurchase(false)}
                  disabled={purchaseBusy !== null}
                  className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60'
                >
                  {purchaseBusy === 'draft' ? t('ops.purchasing.saving') : t('ops.purchasing.saveDraft')}
                </button>
                <button
                  type='button'
                  onClick={() => submitPurchase(true)}
                  disabled={purchaseBusy !== null}
                  className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                >
                  {purchaseBusy === 'post' ? t('ops.purchasing.posting') : t('ops.purchasing.recordAndPost')}
                </button>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            open={openPanel === 'pay'}
            onToggle={() => setOpenPanel((v) => (v === 'pay' ? null : 'pay'))}
            heading={t('ops.purchasing.payHeading')}
            intro={t('ops.purchasing.payIntro')}
          >
            <form onSubmit={submitPayment} className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                <SelectField
                  label={t('table.supplier')}
                  value={paySupplierId}
                  onChange={setPaySupplierId}
                  options={[
                    { value: '', label: t('ops.purchasing.selectSupplierPrompt') },
                    ...supplierOptions,
                  ]}
                />
                <DateField label={t('form.businessDate')} value={payBusinessDate} onChange={setPayBusinessDate} required />
                <DecimalField label={t('form.amount')} value={payAmount} onChange={setPayAmount} placeholder='0.00' />
                <SelectField
                  label={t('form.paymentMethod')}
                  value={payMethod}
                  onChange={setPayMethod}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
                />
                <TextField label={t('form.referenceOptional')} value={payReference} onChange={setPayReference} />
              </div>

              <TextArea label={t('form.notesOptional')} value={payNotes} onChange={setPayNotes} rows={2} />

              {paySupplierId && (
                <div className='rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700'>
                  {outstandingLoading ? (
                    <span>{t('common.loading')}</span>
                  ) : outstanding.length === 0 ? (
                    <span>{t('ops.purchasing.noOutstanding')}</span>
                  ) : (
                    <span>
                      {outstanding.length === 1
                        ? t('ops.purchasing.outstandingOne')
                        : String(outstanding.length) + t('ops.purchasing.outstandingMany')}
                    </span>
                  )}
                </div>
              )}

              <label className='flex items-center gap-2 text-sm text-slate-700'>
                <input
                  type='checkbox'
                  checked={autoAllocate}
                  onChange={(e) => setAutoAllocate(e.target.checked)}
                />
                {t('ops.purchasing.autoAllocate')}
              </label>

              {!autoAllocate && (
                <div className='space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3'>
                  <div className='text-xs font-medium text-slate-600'>{t('ops.purchasing.manualOverride')}</div>
                  {outstanding.length === 0 ? (
                    <div className='text-xs text-slate-500'>{t('ops.purchasing.noOutstanding')}</div>
                  ) : (
                    <ul className='space-y-1 text-sm'>
                      {outstanding.map((inv) => (
                        <li key={inv.id}>
                          <label className='flex items-center gap-2'>
                            <input
                              type='checkbox'
                              checked={manualInvoiceIds.includes(inv.id)}
                              onChange={() => toggleManualInvoice(inv.id)}
                            />
                            <span className='font-mono text-xs'>{inv.invoiceNumber}</span>
                            <span className='text-slate-500'>{'\u2014'} {inv.total}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className='border-t border-slate-100 pt-3'>
                <button
                  type='submit'
                  disabled={payBusy || outstandingLoading}
                  className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                >
                  {payBusy ? t('ops.purchasing.paying') : t('ops.purchasing.paySubmit')}
                </button>
              </div>
            </form>
          </CollapsibleSection>

          <CollapsibleSection
            open={openPanel === 'activity'}
            onToggle={() => setOpenPanel((v) => (v === 'activity' ? null : 'activity'))}
            heading={t('ops.purchasing.activityHeading')}
            intro={t('ops.purchasing.activityIntro')}
          >
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50 text-slate-600'>
                  <tr>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.date')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('ops.purchasing.activity.typeCol')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('ops.purchasing.activity.refCol')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.supplier')}</th>
                    <th className='text-right px-3 py-2 font-medium'>{t('table.amount')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {activityLoading && (
                    <tr><td colSpan={6} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
                  )}
                  {!activityLoading && activity.length === 0 && (
                    <tr><td colSpan={6} className='px-3 py-6 text-center text-slate-400'>{t('ops.purchasing.activity.empty')}</td></tr>
                  )}
                  {activity.map((a) => (
                    <tr key={a.id} className='hover:bg-slate-50'>
                      <td className='px-3 py-2 text-slate-700'>{a.date}</td>
                      <td className='px-3 py-2 text-slate-600'>
                        {a.kind === 'purchase'
                          ? t('ops.purchasing.activity.typePurchase')
                          : t('ops.purchasing.activity.typePayment')}
                      </td>
                      <td className='px-3 py-2 font-mono text-xs text-slate-600'>{a.reference}</td>
                      <td className='px-3 py-2 text-slate-700'>
                        {suppliers.find((su) => su.id === a.supplierId)?.name ?? '\u2014'}
                      </td>
                      <td className='px-3 py-2 text-right font-mono text-slate-700'>{a.amount}</td>
                      <td className='px-3 py-2'>
                        <span className='text-xs rounded bg-slate-100 px-2 py-0.5'>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </>
      )}
    </OpsShell>
  );
}
