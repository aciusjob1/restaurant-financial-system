'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SecondarySurfaceBanner } from '@/components/ops/SecondarySurfaceBanner';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

const MANUAL_TYPES = ['OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT'] as const;
type ManualType = (typeof MANUAL_TYPES)[number];
type Direction = 'IN' | 'OUT';

const DEFAULT_DIRECTION: Record<ManualType, Direction> = {
  OPENING: 'IN',
  CONSUMPTION: 'OUT',
  WASTE: 'OUT',
  ADJUSTMENT: 'IN',
};

function stockTypeKey(t: string): keyof Dict {
  if (t === 'OPENING') return 'stockType.opening';
  if (t === 'CONSUMPTION') return 'stockType.consumption';
  if (t === 'WASTE') return 'stockType.waste';
  if (t === 'ADJUSTMENT') return 'stockType.adjustment';
  return 'stockType.opening';
}

function directionKey(d: string): keyof Dict {
  return d === 'OUT' ? 'direction.out' : 'direction.in';
}

type Material = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type Movement = {
  id: string;
  movementNumber: string;
  materialId: string;
  type: string;
  direction: Direction;
  businessDate: string;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  reference: string | null;
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

export default function StockMovementsPage() {
  const { t, tError } = useT();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const [materialId, setMaterialId] = useState('');
  const [type, setType] = useState<ManualType>('OPENING');
  const [direction, setDirection] = useState<Direction>('IN');
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function refresh() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; materials: Material[] }>('/api/v1/materials'),
      apiFetch<{ success: true; movements: Movement[] }>('/api/v1/stock-movements?limit=100'),
    ])
      .then(([mRes, mvRes]) => {
        setMaterials(mRes.materials.filter((x) => x.isActive));
        setMovements(mvRes.movements);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  function onTypeChange(t: string) {
    const tt = t as ManualType;
    setType(tt);
    setDirection(DEFAULT_DIRECTION[tt]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          materialId,
          type,
          direction,
          businessDate,
          quantity,
          unitCost: unitCost.trim() === '' ? null : unitCost.trim(),
          reference: reference.trim() === '' ? null : reference.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setQuantity('');
      setUnitCost('');
      setReference('');
      setNotes('');
      refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  function materialName(id: string): string {
    const m = materials.find((x) => x.id === id);
    return m ? m.name : id.slice(0, 8);
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.stockMovements.title')}
        subtitle={t('ops.stockMovements.subtitle')}
      />
      <SecondarySurfaceBanner messageKey='ops.inventory.secondary.banner' targetHref='/ops/inventory' targetLabelKey='ops.inventory.secondary.link' />

      <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          <SelectField
            label={t('form.material')}
            value={materialId}
            onChange={setMaterialId}
            required
            options={[
              { value: '', label: t('form.selectPrompt') },
              ...materials.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <SelectField
            label={t('form.type')}
            value={type}
            onChange={onTypeChange}
            required
            options={MANUAL_TYPES.map((x) => ({ value: x, label: t(stockTypeKey(x)) }))}
          />
          <SelectField
            label={t('form.direction')}
            value={direction}
            onChange={(v) => setDirection(v as Direction)}
            required
            options={[
              { value: 'IN', label: t('direction.in') },
              { value: 'OUT', label: t('direction.out') },
            ]}
          />
          <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
          <DecimalField label={t('form.quantity')} value={quantity} onChange={setQuantity} required placeholder='0.000' />
          <DecimalField label={t('form.unitCostOptional')} value={unitCost} onChange={setUnitCost} placeholder='0.00' />
          <TextField label={t('form.referenceOptional')} value={reference} onChange={setReference} placeholder={t('ops.stockMovements.referencePlaceholder')} />
        </div>
        <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />

        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <SubmitButton busy={busy}>{t('action.recordMovement')}</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>#</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.date')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('form.material')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('form.type')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.dir')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.qty')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.unitCost')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.ref')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && movements.length === 0 && (
              <tr><td colSpan={8} className='px-3 py-6 text-center text-slate-400'>{t('ops.stockMovements.empty')}</td></tr>
            )}
            {movements.map((m) => (
              <tr key={m.id} className='border-t border-slate-100'>
                <td className='px-3 py-2 font-mono text-slate-500'>{m.movementNumber}</td>
                <td className='px-3 py-2'>{m.businessDate}</td>
                <td className='px-3 py-2'>{materialName(m.materialId)}</td>
                <td className='px-3 py-2'>{t(stockTypeKey(m.type))}</td>
                <td className='px-3 py-2'>{t(directionKey(m.direction))}</td>
                <td className='px-3 py-2 text-right font-mono'>{m.quantity}</td>
                <td className='px-3 py-2 text-right font-mono'>{m.unitCost ?? '\u2014'}</td>
                <td className='px-3 py-2 text-slate-500'>{m.reference ?? '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
