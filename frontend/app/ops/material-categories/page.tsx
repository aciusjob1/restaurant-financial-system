'use client';

// Verified against backend/src/routes/materialRoutes.ts (M2 step 0).
// Endpoints: GET/POST /api/v1/material-categories, PATCH /:id
// Response envelope: { success: true, categories: [...] } and
//                    { success: true, category: {...} }

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { TextField, TextArea, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';

type Category = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type ListResponse = { success: true; categories: Category[] };
type OneResponse = { success: true; category: Category };

function CategoriesContent() {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (withInactive: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = withInactive ? '?includeInactive=true' : '';
      const res = await apiFetch<ListResponse>(OPS_PATHS.materialCategories + qs);
      setRows(res.categories);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(includeInactive);
  }, [reload, includeInactive]);

  async function onCreate(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch<OneResponse>(OPS_PATHS.materialCategories, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
        }),
      });
      setName('');
      setDescription('');
      await reload(includeInactive);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: Category) {
    setError(null);
    try {
      await apiFetch<OneResponse>(`${OPS_PATHS.materialCategories}/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      await reload(includeInactive);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Material Categories"
        subtitle="Group materials (e.g. Dry Goods, Cooking Oil, Meat)."
      />

      {error && <FormError code={error.code} message={error.message} />}

      <form
        onSubmit={onCreate}
        className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
      >
        <TextField label="Name" value={name} onChange={setName} required />
        <TextArea
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="Optional"
        />
        <SubmitButton busy={busy}>Create category</SubmitButton>
      </form>

      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive
        </label>
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No categories yet.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800">{c.name}</td>
                <td className="px-3 py-2 text-slate-600">{c.description ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      'text-xs px-2 py-0.5 rounded-full ' +
                      (c.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500')
                    }
                  >
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => toggleActive(c)}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {c.isActive ? 'Deactivate' : 'Reactivate'}
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
  return <CategoriesContent />;
}