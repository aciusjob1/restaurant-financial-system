'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type StockRow = {
  materialId: string;
  materialNumber: string;
  name: string;
  unit: string;
  categoryName: string;
  currentStock: string;
  currentPrice: string;
  stockValue: string;
};

type Movement = {
  id: string;
  movementNumber: string;
  materialId: string;
  type: string;
  direction: 'IN' | 'OUT';
  businessDate: string;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

type UsageRow = {
  materialId: string;
  materialNumber: string;
  name: string;
  unit: string;
  categoryName: string;
  opening: string;
  purchasesNet: string;
  openingEntriesNet: string;
  consumed: string;
  wasted: string;
  adjustedNet: string;
  closing: string;
  currentStock: string;
  variance: string | null;
  estConsumptionValue: string;
  historyComplete: boolean;
  columnsConsistent: boolean;
};

type UsagePeriod = 'daily' | 'weekly' | 'monthly';

type Material = { id: string; materialNumber: string; name: string; isActive: boolean };
type Supplier = { id: string; supplierNumber: string; name: string; isActive: boolean };

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

type HistoryRow = {
  id: string;
  kind: 'movement' | 'purchase' | 'payment';
  date: string;
  reference: string;
  label: string;
  quantity: string | null;
  amount: string | null;
  status: string;
};

type DraftItem = {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
  notes: string;
};

type ManualType = 'OPENING' | 'CONSUMPTION' | 'WASTE' | 'ADJUSTMENT';
type Direction = 'IN' | 'OUT';

type SectionKey = 'usage' | 'history' | 'valuation' | 'movement' | 'purchase' | 'payment';

const MANUAL_TYPES: readonly ManualType[] = ['OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT'] as const;

const DEFAULT_DIRECTION: Record<ManualType, Direction> = {
  OPENING: 'IN',
  CONSUMPTION: 'OUT',
  WASTE: 'OUT',
  ADJUSTMENT: 'IN',
};

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

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

function periodRangeUtc(period: UsagePeriod, anchor: Date): { from: Date; to: Date } {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();
  const day = new Date(Date.UTC(y, m, d));
  if (period === 'daily') return { from: day, to: day };
  if (period === 'weekly') {
    const dow = (day.getUTCDay() + 6) % 7;
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - dow);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: monday, to: sunday };
  }
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first, to: last };
}

function toDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function stockTypeKey(t: string): keyof Dict {
  if (t === 'OPENING') return 'stockType.opening';
  if (t === 'CONSUMPTION') return 'stockType.consumption';
  if (t === 'WASTE') return 'stockType.waste';
  if (t === 'ADJUSTMENT') return 'stockType.adjustment';
  return 'stockType.opening';
}

function CollapsibleSection({
  open, onToggle, heading, intro, children, controls,
}: {
  open: boolean;
  onToggle: () => void;
  heading: string;
  intro?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className='rounded-2xl border border-slate-200 bg-white'>
      <div className='w-full flex items-start justify-between gap-3 p-5'>
        <button type='button' onClick={onToggle} className='text-left flex-1'>
          <h2 className='text-base font-medium text-slate-900'>{heading}</h2>
          {intro && <p className='text-xs text-slate-500 mt-1'>{intro}</p>}
        </button>
        {open && controls && <div className='shrink-0'>{controls}</div>}
        <button
          type='button'
          onClick={onToggle}
          aria-label={open ? 'collapse' : 'expand'}
          className='text-slate-400 text-lg leading-none shrink-0 w-6 text-center'
        >
          {open ? '\u2212' : '+'}
        </button>
      </div>
      {open && <div className='px-5 pb-5 space-y-4'>{children}</div>}
    </section>
  );
}

export default function InventoryPage() {
  const { t, tError } = useT();

  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    new Set<SectionKey>(['usage', 'history']),
  );
  function toggleSection(k: SectionKey) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  const [period, setPeriod] = useState<UsagePeriod>('daily');
  const [anchorDate, setAnchorDate] = useState(todayISO());
  const [periodMaterialId, setPeriodMaterialId] = useState('');

  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [totalValue, setTotalValue] = useState('0.00');
  const [valuationLoading, setValuationLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);

  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [usageTotals, setUsageTotals] = useState<{ consumedQty: string; estConsumptionValue: string } | null>(null);
  const [usageIncludesToday, setUsageIncludesToday] = useState(false);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageErr, setUsageErr] = useState<{ code: string; message: string } | null>(null);

  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyErr, setHistoryErr] = useState<{ code: string; message: string } | null>(null);
  const [historyTruncated, setHistoryTruncated] = useState(false);

  const [mvMaterialId, setMvMaterialId] = useState('');
  const [mvType, setMvType] = useState<ManualType>('OPENING');
  const [mvDirection, setMvDirection] = useState<Direction>('IN');
  const [mvBusinessDate, setMvBusinessDate] = useState(todayISO());
  const [mvQuantity, setMvQuantity] = useState('');
  const [mvUnitCost, setMvUnitCost] = useState('');
  const [mvReference, setMvReference] = useState('');
  const [mvNotes, setMvNotes] = useState('');
  const [mvBusy, setMvBusy] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('');
  const [purchaseInvoiceDate, setPurchaseInvoiceDate] = useState(todayISO());
  const [purchaseBusinessDate, setPurchaseBusinessDate] = useState(todayISO());
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [purchaseBusy, setPurchaseBusy] = useState<'draft' | 'post' | null>(null);

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierBusy, setNewSupplierBusy] = useState(false);

  const [paySupplierId, setPaySupplierId] = useState('');
  const [outstanding, setOutstanding] = useState<InvoiceFull[]>([]);
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>('CASH');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payBusinessDate, setPayBusinessDate] = useState(todayISO());
  const [autoAllocate, setAutoAllocate] = useState(true);
  const [manualInvoiceIds, setManualInvoiceIds] = useState<string[]>([]);
  const [payBusy, setPayBusy] = useState(false);

  function loadValuationAndFixtures() {
    setValuationLoading(true);
    Promise.all([
      apiFetch<{ success: true; rows: StockRow[]; totalValue: string }>('/api/v1/stock-movements/valuation'),
      apiFetch<{ success: true; materials: Material[] }>('/api/v1/materials'),
      apiFetch<{ success: true; suppliers: Supplier[] }>('/api/v1/suppliers'),
    ])
      .then(([valRes, matRes, supRes]) => {
        setStockRows(valRes.rows);
        setTotalValue(valRes.totalValue);
        setMaterials(matRes.materials.filter((m) => m.isActive));
        setSuppliers(supRes.suppliers.filter((s) => s.isActive));
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setValuationLoading(false));
  }

  useEffect(() => { loadValuationAndFixtures(); }, []);

  useEffect(() => {
    setUsageLoading(true);
    setUsageErr(null);
    const params = new URLSearchParams();
    params.set('period', period);
    params.set('date', anchorDate);
    if (periodMaterialId) params.set('materialId', periodMaterialId);
    apiFetch<{
      success: true;
      period: UsagePeriod;
      from: string;
      to: string;
      includesToday: boolean;
      rows: UsageRow[];
      totals: { consumedQty: string; estConsumptionValue: string };
    }>('/api/v1/stock-movements/usage?' + params.toString())
      .then((res) => {
        setUsageRows(res.rows);
        setUsageTotals(res.totals);
        setUsageIncludesToday(res.includesToday);
      })
      .catch((e) => setUsageErr(errOf(e)))
      .finally(() => setUsageLoading(false));
  }, [period, anchorDate, periodMaterialId]);

  useEffect(() => {
    setHistoryLoading(true);
    setHistoryErr(null);
    setHistoryTruncated(false);

    const anchor = new Date(anchorDate + 'T00:00:00.000Z');
    const { from: fromD, to: toD } = periodRangeUtc(period, anchor);
    const from = toDateOnlyUtc(fromD);
    const to = toDateOnlyUtc(toD);
    const HISTORY_PER_SOURCE = 41;
    const matParam = periodMaterialId ? '&materialId=' + encodeURIComponent(periodMaterialId) : '';

    Promise.all([
      apiFetch<{ success: true; movements: Movement[] }>(
        '/api/v1/stock-movements?limit=' + HISTORY_PER_SOURCE + '&from=' + from + '&to=' + to + matParam,
      ).catch(() => ({ success: true as const, movements: [] as Movement[] })),
      apiFetch<{ success: true; invoices: InvoiceFull[] }>(
        '/api/v1/purchase-invoices?from=' + from + '&to=' + to,
      ).catch(() => ({ success: true as const, invoices: [] as InvoiceFull[] })),
      apiFetch<{ success: true; payments: Payment[] }>(
        '/api/v1/supplier-payments?includeVoided=true&from=' + from + '&to=' + to,
      ).catch(() => ({ success: true as const, payments: [] as Payment[] })),
    ])
      .then(([mvRes, invRes, payRes]) => {
        const anyTruncated =
          mvRes.movements.length >= HISTORY_PER_SOURCE ||
          invRes.invoices.length >= HISTORY_PER_SOURCE ||
          payRes.payments.length >= HISTORY_PER_SOURCE;

        const nameByMaterial = new Map(materials.map((m) => [m.id, m.name]));
        const nameBySupplier = new Map(suppliers.map((s) => [s.id, s.name]));

        const movementRows: HistoryRow[] = mvRes.movements.map((m) => ({
          id: 'm:' + m.id,
          kind: 'movement',
          date: m.businessDate,
          reference: m.movementNumber,
          label: nameByMaterial.get(m.materialId) ?? m.materialId.slice(0, 8),
          quantity: m.quantity,
          amount: null,
          status: m.type + ' / ' + m.direction,
        }));

        const purchaseRows: HistoryRow[] = invRes.invoices.map((inv) => ({
          id: 'p:' + inv.id,
          kind: 'purchase',
          date: inv.date,
          reference: inv.invoiceNumber,
          label: nameBySupplier.get(inv.supplierId) ?? inv.supplierId.slice(0, 8),
          quantity: null,
          amount: inv.total,
          status: inv.status,
        }));

        const paymentRows: HistoryRow[] = payRes.payments.map((p) => ({
          id: 'y:' + p.id,
          kind: 'payment',
          date: p.businessDate,
          reference: p.paymentNumber,
          label: nameBySupplier.get(p.supplierId) ?? p.supplierId.slice(0, 8),
          quantity: null,
          amount: p.amount,
          status: p.voidedAt ? 'VOIDED' : 'ACTIVE',
        }));

        const merged = [...movementRows, ...purchaseRows, ...paymentRows]
          .sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return a.id < b.id ? 1 : -1;
          })
          .slice(0, 40);

        setHistoryRows(merged);
        setHistoryTruncated(anyTruncated);
      })
      .catch((e) => setHistoryErr(errOf(e)))
      .finally(() => setHistoryLoading(false));
  }, [period, anchorDate, periodMaterialId, materials, suppliers]);

  useEffect(() => {
    if (!paySupplierId) { setOutstanding([]); return; }
    setOutstandingLoading(true);
    apiFetch<{ success: true; invoices: InvoiceFull[] }>(
      '/api/v1/purchase-invoices?supplierId=' + paySupplierId + '&status=POSTED&unpaidOnly=true',
    )
      .then((res) => setOutstanding(res.invoices))
      .catch(() => setOutstanding([]))
      .finally(() => setOutstandingLoading(false));
  }, [paySupplierId]);

  const activeMaterials = useMemo(() => materials.filter((m) => m.isActive), [materials]);
  const materialOptions = useMemo(
    () => activeMaterials.map((m) => ({ value: m.id, label: m.name })),
    [activeMaterials],
  );
  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name + ' (' + s.supplierNumber + ')' })),
    [suppliers],
  );
  const purchaseMaterialOptions = materialOptions;
  const purchaseSubtotal = useMemo(() => moneySum(items), [items]);

  function onMovementTypeChange(v: string) {
    const tt = v as ManualType;
    setMvType(tt);
    setMvDirection(DEFAULT_DIRECTION[tt]);
  }

  async function submitMovement(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setFlash(null);
    if (!mvMaterialId) { setErr({ code: 'MATERIAL_REQUIRED', message: 'Select a material.' }); return; }
    if (!mvQuantity.trim()) { setErr({ code: 'QUANTITY_REQUIRED', message: 'Quantity is required.' }); return; }
    setMvBusy(true);
    try {
      await apiFetch('/api/v1/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          materialId: mvMaterialId,
          type: mvType,
          direction: mvDirection,
          businessDate: mvBusinessDate,
          quantity: mvQuantity.trim(),
          unitCost: mvUnitCost.trim() === '' ? null : mvUnitCost.trim(),
          reference: mvReference.trim() === '' ? null : mvReference.trim(),
          notes: mvNotes.trim() === '' ? null : mvNotes.trim(),
        }),
      });
      setMvQuantity('');
      setMvUnitCost('');
      setMvReference('');
      setMvNotes('');
      setFlash(t('ops.inventory.flash.recorded'));
      loadValuationAndFixtures();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setMvBusy(false); }
  }

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
    setPurchaseInvoiceNumber('');
    setPurchaseNotes('');
    setItems([]);
  }

  async function submitPurchase(postNow: boolean) {
    setErr(null);
    setFlash(null);
    if (!purchaseSupplierId) { setErr({ code: 'SUPPLIER_REQUIRED', message: 'Select a supplier.' }); return; }
    if (!purchaseInvoiceNumber.trim()) { setErr({ code: 'INVOICE_NUMBER_REQUIRED', message: 'Invoice number is required.' }); return; }
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
          supplierId: purchaseSupplierId,
          invoiceNumber: purchaseInvoiceNumber.trim(),
          date: purchaseInvoiceDate,
          businessDate: purchaseBusinessDate,
          notes: purchaseNotes.trim() === '' ? null : purchaseNotes.trim(),
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
      loadValuationAndFixtures();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setPurchaseBusy(null); }
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
      await loadValuationAndFixtures();
      setPurchaseSupplierId(res.supplier.id);
      setPaySupplierId(res.supplier.id);
    } catch (e2) { setErr(errOf(e2)); }
    finally { setNewSupplierBusy(false); }
  }

  function toggleManualInvoice(id: string) {
    setManualInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
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
      if (!autoAllocate) body.allocateTo = manualInvoiceIds;
      else body.autoAllocate = true;
      await apiFetch('/api/v1/supplier-payments/complete', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPayAmount('');
      setPayReference('');
      setPayNotes('');
      setManualInvoiceIds([]);
      setFlash(t('ops.purchasing.flash.paymentRecorded'));
      loadValuationAndFixtures();
      const res = await apiFetch<{ success: true; invoices: InvoiceFull[] }>(
        '/api/v1/purchase-invoices?supplierId=' + paySupplierId + '&status=POSTED&unpaidOnly=true',
      );
      setOutstanding(res.invoices);
    } catch (e2) { setErr(errOf(e2)); }
    finally { setPayBusy(false); }
  }

  return (
    <OpsShell>
      <OpsHeader title={t('ops.inventory.stockHeading')} subtitle={t('ops.inventory.stockIntro')} />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {flash}
        </div>
      )}

      <CollapsibleSection
        open={openSections.has('usage')}
        onToggle={() => toggleSection('usage')}
        heading={t('ops.inventory.usage.heading')}
        controls={
          <div className='flex flex-wrap items-center gap-2 justify-end'>
            <div className='flex gap-1'>
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button
                  key={p}
                  type='button'
                  onClick={() => setPeriod(p)}
                  className={
                    'px-3 py-1 text-xs rounded ' +
                    (period === p ? 'bg-slate-900 text-white'
                                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50')
                  }
                >
                  {t(p === 'daily' ? 'ops.inventory.usage.period.daily'
                     : p === 'weekly' ? 'ops.inventory.usage.period.weekly'
                     : 'ops.inventory.usage.period.monthly')}
                </button>
              ))}
            </div>
            <input
              type='date'
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              max={todayISO()}
              className='rounded-lg border border-slate-300 px-2 py-1 text-sm'
            />
            <select
              value={periodMaterialId}
              onChange={(e) => setPeriodMaterialId(e.target.value)}
              className='rounded-lg border border-slate-300 px-2 py-1 text-sm'
            >
              <option value=''>{t('ops.inventory.usage.allMaterials')}</option>
              {stockRows.map((r) => (
                <option key={r.materialId} value={r.materialId}>{r.name}</option>
              ))}
            </select>
          </div>
        }
      >
        {usageErr && <FormError code={usageErr.code} message={tError(usageErr.code, usageErr.message)} />}
        {usageLoading ? (
          <div className='text-slate-500'>{t('common.loading')}</div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm min-w-[1200px]'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='text-left px-3 py-2 font-medium'>{t('ops.purchasing.materialCol')}</th>
                  <th className='text-left px-3 py-2 font-medium'>{t('form.category')}</th>
                  <th className='text-left px-3 py-2 font-medium'>{t('form.unit')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.opening')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.purchasesNet')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.openingEntriesNet')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.consumed')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.wasted')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.adjustedNet')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.closing')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.current')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.variance')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.inventory.usage.col.estValue')}</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.length === 0 && (
                  <tr><td colSpan={13} className='px-3 py-6 text-center text-slate-400'>
                    {t('ops.inventory.usage.empty')}
                  </td></tr>
                )}
                {usageRows.map((r) => {
                  const rowClass =
                    'border-t border-slate-100' +
                    (r.historyComplete ? '' : ' border-l-4 border-l-amber-400');
                  return (
                    <tr key={r.materialId} className={rowClass}>
                      <td className='px-3 py-2'>
                        <span className='text-slate-400 font-mono text-xs mr-2'>{r.materialNumber}</span>
                        <span className='text-slate-900'>{r.name}</span>
                        {!r.historyComplete && (
                          <div className='text-xs text-amber-800 italic mt-0.5'>
                            {t('ops.inventory.usage.historyIncomplete')}
                          </div>
                        )}
                      </td>
                      <td className='px-3 py-2 text-slate-600'>{r.categoryName}</td>
                      <td className='px-3 py-2 text-slate-600'>{r.unit}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.opening}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.purchasesNet}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.openingEntriesNet}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.consumed}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.wasted}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.adjustedNet}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.closing}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.currentStock}</td>
                      <td className={'px-3 py-2 text-right font-mono ' + (
                        r.variance === null ? 'text-slate-400'
                        : Math.abs(parseFloat(r.variance)) < 0.005 ? 'text-emerald-700'
                        : 'text-amber-700'
                      )}>
                        {r.variance === null ? '\u2014' : r.variance}
                      </td>
                      <td className='px-3 py-2 text-right font-mono'>{r.estConsumptionValue}</td>
                    </tr>
                  );
                })}
              </tbody>
              {usageTotals && usageRows.length > 0 && (
                <tfoot className='bg-slate-50'>
                  <tr>
                    <td colSpan={6} className='px-3 py-2 text-right font-medium text-slate-700'>
                      {t('ops.inventory.usage.totalLabel')}
                    </td>
                    <td className='px-3 py-2 text-right font-mono font-medium'>{usageTotals.consumedQty}</td>
                    <td colSpan={5} />
                    <td className='px-3 py-2 text-right font-mono font-medium'>{usageTotals.estConsumptionValue}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            <div className='text-xs text-slate-500 mt-3'>
              {t('ops.inventory.usage.estimateNote')}
              {!usageIncludesToday && (
                <span className='ml-2'>{t('ops.inventory.usage.varianceNote')}</span>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSections.has('history')}
        onToggle={() => toggleSection('history')}
        heading={t('ops.inventory.history.heading')}
        intro={t('ops.inventory.history.intro')}
      >
        {historyErr && <FormError code={historyErr.code} message={tError(historyErr.code, historyErr.message)} />}
        {historyLoading ? (
          <div className='text-slate-500'>{t('common.loading')}</div>
        ) : (
          <>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.date')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('ops.inventory.history.typeCol')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('ops.inventory.history.refCol')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('ops.inventory.history.labelCol')}</th>
                    <th className='text-right px-3 py-2 font-medium'>{t('table.qty')}</th>
                    <th className='text-right px-3 py-2 font-medium'>{t('table.amount')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 && (
                    <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>
                      {t('ops.inventory.history.empty')}
                    </td></tr>
                  )}
                  {historyRows.map((h) => (
                    <tr key={h.id} className='border-t border-slate-100'>
                      <td className='px-3 py-2 text-slate-700'>{h.date}</td>
                      <td className='px-3 py-2'>
                        <span className={
                          'text-xs px-2 py-0.5 rounded ' +
                          (h.kind === 'movement' ? 'bg-slate-100 text-slate-700'
                           : h.kind === 'purchase' ? 'bg-blue-100 text-blue-800'
                           : 'bg-emerald-100 text-emerald-800')
                        }>
                          {h.kind === 'movement' ? t('ops.inventory.history.type.movement')
                           : h.kind === 'purchase' ? t('ops.inventory.history.type.purchase')
                           : t('ops.inventory.history.type.payment')}
                        </span>
                      </td>
                      <td className='px-3 py-2 font-mono text-xs text-slate-600'>{h.reference}</td>
                      <td className='px-3 py-2 text-slate-800'>{h.label}</td>
                      <td className='px-3 py-2 text-right font-mono'>{h.quantity ?? '\u2014'}</td>
                      <td className='px-3 py-2 text-right font-mono'>{h.amount ?? '\u2014'}</td>
                      <td className='px-3 py-2'>
                        <span className='text-xs rounded bg-slate-100 px-2 py-0.5'>{h.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='text-xs text-slate-500 mt-2'>
              {historyTruncated ? t('ops.inventory.history.truncated') : t('ops.inventory.history.complete')}
            </div>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSections.has('valuation')}
        onToggle={() => toggleSection('valuation')}
        heading={t('ops.inventory.stockHeading')}
        intro={t('ops.inventory.stockIntro')}
        controls={
          <div className='text-sm text-slate-700'>
            {t('ops.inventory.totalValue')}: <span className='font-mono'>{totalValue}</span>
          </div>
        }
      >
        {valuationLoading ? (
          <div className='text-slate-500'>{t('common.loading')}</div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='text-left px-3 py-2 font-medium'>{t('ops.purchasing.materialCol')}</th>
                  <th className='text-left px-3 py-2 font-medium'>{t('form.category')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.purchasing.qtyCol')}</th>
                  <th className='text-left px-3 py-2 font-medium'>{t('form.unit')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.purchasing.unitPriceCol')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.purchasing.lineTotalCol')}</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.length === 0 && (
                  <tr><td colSpan={6} className='px-3 py-6 text-center text-slate-400'>
                    {t('ops.inventory.emptyStock')}
                  </td></tr>
                )}
                {stockRows.map((r) => (
                  <tr key={r.materialId} className='border-t border-slate-100'>
                    <td className='px-3 py-2'>
                      <span className='text-slate-400 font-mono text-xs mr-2'>{r.materialNumber}</span>
                      <span className='text-slate-900'>{r.name}</span>
                    </td>
                    <td className='px-3 py-2 text-slate-600'>{r.categoryName}</td>
                    <td className='px-3 py-2 text-right font-mono'>{r.currentStock}</td>
                    <td className='px-3 py-2 text-slate-600'>{r.unit}</td>
                    <td className='px-3 py-2 text-right font-mono'>{r.currentPrice}</td>
                    <td className='px-3 py-2 text-right font-mono'>{r.stockValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSections.has('movement')}
        onToggle={() => toggleSection('movement')}
        heading={t('ops.inventory.recordHeading')}
        intro={t('ops.inventory.recordIntro')}
      >
        <form onSubmit={submitMovement} className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            <SelectField
              label={t('form.material')}
              value={mvMaterialId}
              onChange={setMvMaterialId}
              required
              options={[{ value: '', label: t('form.selectPrompt') }, ...materialOptions]}
            />
            <SelectField
              label={t('form.type')}
              value={mvType}
              onChange={onMovementTypeChange}
              required
              options={MANUAL_TYPES.map((x) => ({ value: x, label: t(stockTypeKey(x)) }))}
            />
            <SelectField
              label={t('form.direction')}
              value={mvDirection}
              onChange={(v) => setMvDirection(v as Direction)}
              required
              options={[
                { value: 'IN', label: t('direction.in') },
                { value: 'OUT', label: t('direction.out') },
              ]}
            />
            <DateField label={t('form.businessDate')} value={mvBusinessDate} onChange={setMvBusinessDate} required />
            <DecimalField label={t('form.quantity')} value={mvQuantity} onChange={setMvQuantity} required placeholder='0.000' />
            <DecimalField label={t('form.unitCostOptional')} value={mvUnitCost} onChange={setMvUnitCost} placeholder='0.00' />
            <TextField
              label={t('form.referenceOptional')}
              value={mvReference}
              onChange={setMvReference}
              placeholder={t('ops.stockMovements.referencePlaceholder')}
            />
          </div>
          <TextArea label={t('form.notesOptional')} value={mvNotes} onChange={setMvNotes} rows={2} />
          <SubmitButton busy={mvBusy}>{t('action.recordMovement')}</SubmitButton>
        </form>
      </CollapsibleSection>

      <CollapsibleSection
        open={openSections.has('purchase')}
        onToggle={() => toggleSection('purchase')}
        heading={t('ops.purchasing.recordHeading')}
        intro={t('ops.purchasing.purchaseIntro')}
      >
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          <div className='space-y-2'>
            <SelectField
              label={t('table.supplier')}
              value={purchaseSupplierId}
              onChange={setPurchaseSupplierId}
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
            value={purchaseInvoiceNumber}
            onChange={setPurchaseInvoiceNumber}
          />
          <DateField label={t('form.invoiceDate')} value={purchaseInvoiceDate} onChange={setPurchaseInvoiceDate} required />
          <DateField label={t('form.businessDate')} value={purchaseBusinessDate} onChange={setPurchaseBusinessDate} required />
        </div>

        {showNewSupplier && (
          <form onSubmit={createSupplierInline} className='rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <TextField label={t('ops.purchasing.newSupplierName')} value={newSupplierName} onChange={setNewSupplierName} required />
              <TextField label={t('ops.purchasing.newSupplierPhone')} value={newSupplierPhone} onChange={setNewSupplierPhone} />
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

        <TextArea label={t('form.notesOptional')} value={purchaseNotes} onChange={setPurchaseNotes} rows={2} />

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
                          {purchaseMaterialOptions.map((o) => (
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
            {t('ops.purchasing.subtotalLabel')}: <span className='font-mono'>{purchaseSubtotal}</span>
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
        open={openSections.has('payment')}
        onToggle={() => toggleSection('payment')}
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
    </OpsShell>
  );
}