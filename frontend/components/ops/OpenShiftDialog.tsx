'use client';

import { useState, type FormEvent } from 'react';
import { DecimalField, DateField, TextArea, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function OpenShiftDialog({ onClose, onDone }: {
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { t, tError } = useT();
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/shifts', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          openingCash: openingCash.trim() || '0.00',
          notes: notes.trim() || null,
        }),
      });
      onDone(t('ops.cashFlow.flash.shiftOpened'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
      else setErr({ code: 'ERR', message: 'Request failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <div className='w-full max-w-lg rounded-2xl bg-white p-6 space-y-4'>
        <h3 className='text-lg font-medium text-slate-900'>{t('ops.cashFlow.startDialog.title')}</h3>
        <form onSubmit={submit} className='space-y-4'>
          <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
          <DecimalField label={t('ops.shifts.openingCashOptional')} value={openingCash} onChange={setOpeningCash} placeholder='0.00' />
          <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />
          {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
          <div className='flex justify-end gap-2'>
            <button type='button' onClick={onClose} disabled={busy}
              className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>{t('action.cancel')}</button>
            <button type='submit' disabled={busy}
              className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
              {busy ? t('ops.cashFlow.startDialog.submitting') : t('action.startShift')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}