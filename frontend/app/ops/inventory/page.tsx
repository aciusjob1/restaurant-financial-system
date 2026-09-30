'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

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

type Action = 'OPENING' | 'CONSUMPTION' | 'WASTE' | 'ADJUSTMENT';

const ACTION_DIRECTION: Record<Action, 'IN' | 'OUT' | null> = {
  OPENING: 'IN',
  CONSUMPTION: 'OUT',
  WASTE: 'OUT',
  ADJUSTMENT: null,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function ActionCard({
  active, onClick, label, hint,
}: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={
        'rounded-2xl border p-4 text-left transition-colors ' +
        (active
          ? 'border-slate-900 bg-slate-50'
          : 'border-slate-200 bg-white hover:border-slate-300')
      }
    >
      <div className='text-sm font-medium text-slate-900'>{label}</div>
      <div className='text-xs text-slate-500 mt-1'>{hint}</div>
    </button>
  );
}

export default function InventoryPage() {
  const { t, tError } = useT();

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [totalValue, setTotalValue] = useState('0.00');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(true);
  const [action, setAction] = useState<Action>('CONSUMPTION');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [materialId, setMaterialId] = useState('');
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; rows: StockRow[]; totalValue: string }>('/api/v1/stock-movements/valuation'),
      apiFetch<{ success: true; movements: Movement[] }>('/api/v1/stock-movements?limit=25'),
    ])
      .then(([valRes, mvRes]) => {
        setStockRows(valRes.rows);
        setTotalValue(valRes.totalValue);
        setMovements(mvRes.movements);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function pickAction(a: Action) {
    setAction(a);
    const d = ACTION_DIRECTION[a];
    if (d) setDirection(d);
    setErr(null);
    setFlash(null);
  }

  const materialOptions = useMemo(
    () => stockRows.map((r) => ({
      value: r.materialId,
      label: r.name + ' \\u2014 ' + r.currentStock + ' ' + r.unit,
    })),
    [stockRows]
  );

  function actionLabel(a: Action): string {
    if (a === 'OPENING') return t('ops.inventory.actionOpening');
    if (a === 'CONSUMPTION') return t('ops.inventory.actionUse');
    if (a === 'WASTE') return t('ops.inventory.actionWaste');
    return t('ops.inventory.actionCorrect');
  }

  function actionHint(a: Action): string {
    if (a === 'OPENING') return t('ops.inventory.actionOpeningHint');
    if (a === 'CONSUMPTION') return t('ops.inventory.actionUseHint');
    if (a === 'WASTE') return t('ops.inventory.actionWasteHint');
    return t('ops.inventory.actionCorrectHint');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setFlash(null);
    if (!materialId) { setErr({ code: 'MATERIAL_REQUIRED', message: 'Select a material.' }); return; }
    if (!quantity.trim()) { setErr({ code: 'QUANTITY_REQUIRED', message: 'Quantity is required.' }); return; }
    setBusy(true);
    try {
      await apiFetch('/api/v1/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          materialId,
          type: action,
          direction,
          businessDate,
          quantity: quantity.trim(),
          unitCost: unitCost.trim() === '' ? null : unitCost.trim(),
          reference: reference.trim() === '' ? null : reference.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setQuantity('');
      setUnitCost('');
      setReference('');
      setNotes('');
      setFlash(t('ops.inventory.flash.recorded'));
      load();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setBusy(false);
    }
  }

  function stockBadgeClass(row: StockRow): string {
    const q = parseFloat(row.currentStock);
    if (q <= 0) return 'text-xs rounded px-2 py-0.5 bg-red-100 text-red-700';
    return 'text-xs rounded px-2 py-0.5 bg-emerald-100 text-emerald-700';
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

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
        <>
          {/* ---- Current stock ---- */}
          <section className='rounded-2xl border border-slate-200 bg-white overflow-hidden'>
            <div className='flex items-center justify-between px-5 py-3 border-b border-slate-100'>
              <h2 className='text-base font-medium text-slate-900'>{t('ops.inventory.stockHeading')}</h2>
              <div className='text-sm text-slate-700'>
                {t('ops.inventory.totalValue')}: <span className='font-mono'>{totalValue}</span>
              </div>
            </div>
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
                      <td className='px-3 py-2 text-right'>
                        <span className={stockBadgeClass(r)}>{r.currentStock}</span>
                      </td>
                      <td className='px-3 py-2 text-slate-600'>{r.unit}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.currentPrice}</td>
                      <td className='px-3 py-2 text-right font-mono'>{r.stockValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---- Adjust stock ---- */}
          <section className='rounded-2xl border border-slate-200 bg-white'>
            <button
              type='button'
              onClick={() => setAdjustOpen((v) => !v)}
              className='w-full flex items-start justify-between gap-3 p-5 text-left'
            >
              <div>
                <h2 className='text-base font-medium text-slate-900'>{t('ops.inventory.adjustHeading')}</h2>
                <p className='text-xs text-slate-500 mt-1'>{t('ops.inventory.adjustIntro')}</p>
              </div>
              <span className='text-slate-400 text-lg leading-none shrink-0'>{adjustOpen ? '\u2212' : '+'}</span>
            </button>
            {adjustOpen && (
              <form onSubmit={submit} className='px-5 pb-5 space-y-4'>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
                  <ActionCard active={action === 'OPENING'}     onClick={() => pickAction('OPENING')}     label={actionLabel('OPENING')}     hint={actionHint('OPENING')} />
                  <ActionCard active={action === 'CONSUMPTION'} onClick={() => pickAction('CONSUMPTION')} label={actionLabel('CONSUMPTION')} hint={actionHint('CONSUMPTION')} />
                  <ActionCard active={action === 'WASTE'}       onClick={() => pickAction('WASTE')}       label={actionLabel('WASTE')}       hint={actionHint('WASTE')} />
                  <ActionCard active={action === 'ADJUSTMENT'}  onClick={() => pickAction('ADJUSTMENT')}  label={actionLabel('ADJUSTMENT')}  hint={actionHint('ADJUSTMENT')} />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                  <SelectField
                    label={t('ops.purchasing.materialCol')}
                    value={materialId}
                    onChange={setMaterialId}
                    options={[
                      { value: '', label: t('ops.purchasing.selectMaterialPrompt') },
                      ...materialOptions,
                    ]}
                  />
                  <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
                  <DecimalField label={t('form.quantity')} value={quantity} onChange={setQuantity} placeholder='0.000' />
                  <DecimalField label={t('form.unitCostOptional')} value={unitCost} onChange={setUnitCost} placeholder='0.00' />
                  <TextField label={t('form.referenceOptional')} value={reference} onChange={setReference} />
                </div>

                {action === 'ADJUSTMENT' && (
                  <div className='rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2'>
                    <div className='text-xs font-medium text-slate-600'>{t('ops.inventory.direction')}</div>
                    <label className='flex items-center gap-2 text-sm text-slate-700'>
                      <input
                        type='radio'
                        name='direction'
                        checked={direction === 'IN'}
                        onChange={() => setDirection('IN')}
                      />
                      {t('ops.inventory.directionIn')}
                    </label>
                    <label className='flex items-center gap-2 text-sm text-slate-700'>
                      <input
                        type='radio'
                        name='direction'
                        checked={direction === 'OUT'}
                        onChange={() => setDirection('OUT')}
                      />
                      {t('ops.inventory.directionOut')}
                    </label>
                  </div>
                )}

                <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />

                <div className='border-t border-slate-100 pt-3'>
                  <SubmitButton busy={busy}>
                    {busy ? t('ops.inventory.submitting') : t('ops.inventory.submit')}
                  </SubmitButton>
                </div>
              </form>
            )}
          </section>

          {/* ---- Recent movements ---- */}
          <section className='rounded-2xl border border-slate-200 bg-white overflow-hidden'>
            <div className='flex items-center justify-between px-5 py-3 border-b border-slate-100'>
              <h2 className='text-base font-medium text-slate-900'>{t('ops.inventory.recentHeading')}</h2>
              <Link href='/ops/stock-movements' className='text-xs text-slate-600 underline hover:text-slate-900'>
                {t('ops.inventory.viewAll')}
              </Link>
            </div>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left px-3 py-2 font-medium'>#</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.date')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('ops.purchasing.materialCol')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('form.type')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.dir')}</th>
                    <th className='text-right px-3 py-2 font-medium'>{t('table.qty')}</th>
                    <th className='text-right px-3 py-2 font-medium'>{t('table.unitCost')}</th>
                    <th className='text-left px-3 py-2 font-medium'>{t('table.ref')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && (
                    <tr><td colSpan={8} className='px-3 py-6 text-center text-slate-400'>
                      {t('ops.inventory.emptyMovements')}
                    </td></tr>
                  )}
                  {movements.map((m) => {
                    const row = stockRows.find((r) => r.materialId === m.materialId);
                    return (
                      <tr key={m.id} className='border-t border-slate-100'>
                        <td className='px-3 py-2 font-mono text-slate-500'>{m.movementNumber}</td>
                        <td className='px-3 py-2'>{m.businessDate}</td>
                        <td className='px-3 py-2'>{row ? row.name : m.materialId.slice(0, 8)}</td>
                        <td className='px-3 py-2 text-slate-600'>{m.type}</td>
                        <td className='px-3 py-2'>{m.direction}</td>
                        <td className='px-3 py-2 text-right font-mono'>{m.quantity}</td>
                        <td className='px-3 py-2 text-right font-mono'>{m.unitCost ?? '\\u2014'}</td>
                        <td className='px-3 py-2 text-slate-500'>{m.reference ?? '\\u2014'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </OpsShell>
  );
}
