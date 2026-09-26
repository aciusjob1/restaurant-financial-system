'use client';

// Verified against backend/src/routes/materialRoutes.ts (M2 step 0).
// Endpoints: GET/POST /api/v1/materials, PATCH /:id
// Response envelope: { success: true, materials: [...] }
//                    { success: true, material: {...} }
// Materials reference categories; dropdown loads /api/v1/material-categories.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  TextField,
  DecimalField,
  SelectField,
  TextArea,
  FormError,
  SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';

type Category = { id: string; name: string; isActive: boolean };

type Material = {
  id: string;
  materialNumber: string;
  name: string;
  categoryId: string;
  unit: string;
  currentPrice: string;
  minimumStock: string;
  isActive: boolean;
};

type ListCategoriesResponse = { success: true; categories: Category[] };
type ListMaterialsResponse = { success: true; materials: Material[] };
type OneMaterialResponse = { success: true; material: Material };

function MaterialsContent() {
  const [rows, setRows] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState('');

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [minimumStock, setMinimumStock] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    async (withInactive: boolean, searchTerm: string) => {
      setLoading(true);
      setError(null);
      try {
        const p = new URLSearchParams();
        if (withInactive) p.set('includeInactive', 'true');
        if (searchTerm.trim()) p.set('search', searchTerm.trim());
        const qs = p.toString();
        const res = await apiFetch<ListMaterialsResponse>(
          OPS_PATHS.materials + (qs ? '?' + qs : '')
        );
        setRows(res.materials);
      } catch (e) {
        if (e instanceof ApiError) setError({ code: e.code, message: e.message });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    apiFetch<ListCategoriesResponse>(OPS_PATHS.materialCategories)
      .then((res) => {
        setCategories(res.categories);
        if (res.categories.length > 0 && !categoryId) {
          setCategoryId(res.categories[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload(includeInactive, search);
  }, [reload, includeInactive, search]);

  async function onCreate(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        categoryId,
        unit: unit.trim(),
        currentPrice: currentPrice.trim(),
      };
      if (minimumStock.trim()) body.minimumStock = minimumStock.trim();
      if (notes.trim()) body.notes = notes.trim();
      await apiFetch<OneMaterialResponse>(OPS_PATHS.materials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setName('');
      setUnit('');
      setCurrentPrice('');
      setMinimumStock('');
      setNotes('');
      await reload(includeInactive, search);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(m: Material) {
    setError(null);
    try {
      await apiFetch<OneMaterialResponse>(`${OPS_PATHS.materials}/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      await reload(includeInactive, search);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Materials"
        subtitle="The catalogue of things the restaurant buys. Prices are decimal strings from the server."
      />

      {error && <FormError code={error.code} message={error.message} />}

      {categories.length === 0 && !loading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No categories yet. Create a category first at{' '}
          <a href="/ops/material-categories" className="underline">
            /ops/material-categories
          </a>
          .
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField label="Name" value={name} onChange={setName} required />
          <SelectField
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            required
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <TextField
            label="Unit"
            value={unit}
            onChange={setUnit}
            placeholder="kg, L, pcs"
            required
          />
          <DecimalField
            label="Current price"
            value={currentPrice}
            onChange={setCurrentPrice}
            placeholder="0.00"
            required
          />
          <DecimalField
            label="Minimum stock"
            value={minimumStock}
            onChange={setMinimumStock}
            placeholder="Optional, 0.00"
          />
        </div>
        <TextArea
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Optional"
        />
        <SubmitButton busy={busy}>Create material</SubmitButton>
      </form>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive
        </label>
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Unit</th>
              <th className="text-right px-3 py-2 font-medium">Price</th>
              <th className="text-right px-3 py-2 font-medium">Min</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No materials yet.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {m.materialNumber}
                </td>
                <td className="px-3 py-2 text-slate-800">{m.name}</td>
                <td className="px-3 py-2 text-slate-600">{m.unit}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                  {m.currentPrice}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-600">
                  {m.minimumStock}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      'text-xs px-2 py-0.5 rounded-full ' +
                      (m.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500')
                    }
                  >
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => toggleActive(m)}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {m.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}

export default function Page() {
  return <MaterialsContent />;
}
