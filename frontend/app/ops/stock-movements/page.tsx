'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const MANUAL_TYPES = ['OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT'] as const;
type ManualType = (typeof MANUAL_TYPES)[number];
type Direction = 'IN' | 'OUT';

const DEFAULT_DIRECTION: Record<ManualType, Direction> = {
  OPENING: 'IN',
  CONSUMPTION: 'OUT',
  WASTE: 'OUT',
  ADJUSTMENT: 'IN',
};

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
        title="Stock Movements"
        subtitle="Manual opening, consumption, waste, and adjustments. Purchases post from invoices."
      />

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <SelectField
            label="Material"
            value={materialId}
            onChange={setMaterialId}
            required
            options={[
              { value: '', label: '— select —' },
              ...materials.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <SelectField
            label="Type"
            value={type}
            onChange={onTypeChange}
            required
            options={MANUAL_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <SelectField
            label="Direction"
            value={direction}
            onChange={(v) => setDirection(v as Direction)}
            required
            options={[
              { value: 'IN', label: 'IN (stock in)' },
              { value: 'OUT', label: 'OUT (stock out)' },
            ]}
          />
          <DateField label="Business date" value={businessDate} onChange={setBusinessDate} required />
          <DecimalField label="Quantity" value={quantity} onChange={setQuantity} required placeholder="0.000" />
          <DecimalField label="Unit cost (optional)" value={unitCost} onChange={setUnitCost} placeholder="0.00" />
          <TextField label="Reference (optional)" value={reference} onChange={setReference} placeholder="e.g. delivery note #" />
        </div>
        <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />

        {err && <FormError code={err.code} message={err.message} />}
        <SubmitButton busy={busy}>Record movement</SubmitButton>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Material</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Dir</th>
              <th className="text-right px-3 py-2 font-medium">Qty</th>
              <th className="text-right px-3 py-2 font-medium">Unit cost</th>
              <th className="text-left px-3 py-2 font-medium">Ref</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && movements.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No movements yet.</td></tr>
            )}
            {movements.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-slate-500">{m.movementNumber}</td>
                <td className="px-3 py-2">{m.businessDate}</td>
                <td className="px-3 py-2">{materialName(m.materialId)}</td>
                <td className="px-3 py-2">{m.type}</td>
                <td className="px-3 py-2">{m.direction}</td>
                <td className="px-3 py-2 text-right font-mono">{m.quantity}</td>
                <td className="px-3 py-2 text-right font-mono">{m.unitCost ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">{m.reference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}