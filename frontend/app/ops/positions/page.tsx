'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DecimalField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Position = {
  id: string;
  name: string;
  description: string | null;
  defaultSalary: string;
  isActive: boolean;
  createdAt?: string;
};

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function PositionsPage() {
  const { t, tError } = useT();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [name, setName] = useState('');
  const [defaultSalary, setDefaultSalary] = useState('');
  const [description, setDescription] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    apiFetch<{ success: true; positions: Position[] }>('/api/v1/positions')
      .then((r) => setPositions(r.positions))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/positions', {
        method: 'POST',
        body: JSON.stringify({
          name,
          defaultSalary,
          description: description.trim() === '' ? null : description.trim(),
        }),
      });
      setName('');
      setDefaultSalary('');
      setDescription('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  const visible = includeInactive ? positions : positions.filter((p) => p.isActive);

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.positions.title')}
        subtitle={t('ops.positions.subtitle')}
      />

      <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.positions.newHeading')}</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <TextField
            label={t('form.name')}
            value={name}
            onChange={setName}
            required
            placeholder={t('ops.positions.namePlaceholder')}
          />
          <DecimalField
            label={t('form.defaultSalary')}
            value={defaultSalary}
            onChange={setDefaultSalary}
            required
            placeholder='0.00'
          />
        </div>
        <TextArea
          label={t('ops.positions.descriptionLabel')}
          value={description}
          onChange={setDescription}
          rows={2}
        />
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <SubmitButton busy={busy}>{t('action.createPosition')}</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <div className='flex items-center justify-between px-4 py-3 border-b border-slate-100'>
          <span className='text-xs text-slate-500'>
            {visible.length} {t('ops.positions.countLabel')}
          </span>
          <label className='flex items-center gap-2 text-xs text-slate-600'>
            <input
              type='checkbox'
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            {t('common.includeInactive')}
          </label>
        </div>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>{t('table.name')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.description')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.defaultSalary')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={4} className='px-3 py-6 text-center text-slate-400'>{t('ops.positions.empty')}</td>
              </tr>
            )}
            {visible.map((p) => (
              <tr key={p.id} className='border-t border-slate-100'>
                <td className='px-3 py-2'>{p.name}</td>
                <td className='px-3 py-2 text-slate-600'>{p.description ?? '\u2014'}</td>
                <td className='px-3 py-2 text-right font-mono'>{p.defaultSalary}</td>
                <td className='px-3 py-2'>
                  {p.isActive
                    ? <span className='text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5'>{t('action.active')}</span>
                    : <span className='text-xs rounded bg-slate-100 text-slate-500 px-2 py-0.5'>{t('action.inactive')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
