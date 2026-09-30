'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SecondarySurfaceBanner } from '@/components/ops/SecondarySurfaceBanner';
import { TextField, TextArea, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';

type Supplier = {
  id: string;
  supplierNumber: string;
  name: string;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  isActive: boolean;
};

type ListResponse = { success: true; suppliers: Supplier[] };
type OneResponse = { success: true; supplier: Supplier };

function SuppliersContent() {
  const { t, tError } = useT();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (withInactive: boolean, term: string) => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (withInactive) p.set('includeInactive', 'true');
      if (term.trim()) p.set('search', term.trim());
      const qs = p.toString();
      const res = await apiFetch<ListResponse>(OPS_PATHS.suppliers + (qs ? '?' + qs : ''));
      setRows(res.suppliers);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(includeInactive, search);
  }, [reload, includeInactive, search]);

  async function onCreate(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();
      if (contactPerson.trim()) body.contactPerson = contactPerson.trim();
      if (notes.trim()) body.notes = notes.trim();

      await apiFetch<OneResponse>(OPS_PATHS.suppliers, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setName('');
      setPhone('');
      setEmail('');
      setContactPerson('');
      setNotes('');
      await reload(includeInactive, search);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: Supplier) {
    setError(null);
    try {
      await apiFetch<OneResponse>(OPS_PATHS.suppliers + '/' + s.id, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      await reload(includeInactive, search);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.suppliers.title')}
        subtitle={t('ops.suppliers.subtitle')}
      />
      <SecondarySurfaceBanner messageKey='ops.purchasing.secondary.banner' targetHref='/ops/purchasing' targetLabelKey='ops.purchasing.secondary.link' />

      {error && <FormError code={error.code} message={tError(error.code, error.message)} />}

      <form onSubmit={onCreate} className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <TextField label={t('form.name')} value={name} onChange={setName} required />
          <TextField label={t('form.phone')} value={phone} onChange={setPhone} />
          <TextField label={t('form.email')} value={email} onChange={setEmail} />
          <TextField label={t('form.contactPerson')} value={contactPerson} onChange={setContactPerson} />
        </div>
        <TextArea label={t('form.notes')} value={notes} onChange={setNotes} placeholder={t('common.optional')} />
        <SubmitButton busy={busy}>{t('action.createSupplier')}</SubmitButton>
      </form>

      <div className='flex flex-wrap items-center gap-4 justify-between'>
        <label className='text-sm text-slate-600 flex items-center gap-2'>
          <input
            type='checkbox'
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          {t('common.includeInactive')}
        </label>
        <input
          type='text'
          placeholder={t('common.searchByName')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
        />
        {loading && <span className='text-xs text-slate-400'>{t('common.loading')}</span>}
      </div>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50 text-slate-600'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>#</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.name')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.phone')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.contact')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.action')}</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className='px-3 py-6 text-center text-slate-500'>
                  {t('ops.suppliers.empty')}
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id} className='hover:bg-slate-50'>
                <td className='px-3 py-2 font-mono text-xs text-slate-500'>{s.supplierNumber}</td>
                <td className='px-3 py-2 text-slate-800'>{s.name}</td>
                <td className='px-3 py-2 text-slate-600'>{s.phone ?? '\u2014'}</td>
                <td className='px-3 py-2 text-slate-600'>{s.contactPerson ?? '\u2014'}</td>
                <td className='px-3 py-2'>
                  <span
                    className={
                      'text-xs px-2 py-0.5 rounded-full ' +
                      (s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')
                    }
                  >
                    {s.isActive ? t('action.active') : t('action.inactive')}
                  </span>
                </td>
                <td className='px-3 py-2 text-right'>
                  <button
                    type='button'
                    onClick={() => toggleActive(s)}
                    className='text-xs text-blue-700 hover:underline'
                  >
                    {s.isActive ? t('action.deactivate') : t('action.reactivate')}
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
  return <SuppliersContent />;
}
