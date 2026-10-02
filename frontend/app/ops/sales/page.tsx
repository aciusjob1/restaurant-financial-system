'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DateField, DecimalField, SelectField, TextArea, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

// ---------- types ----------

type SalesSummary = {
  id: string;
  businessDate: string;
  source: string;
  sourceReference: string;
  userId: string | null;
  totalSales: string;
  cashSales: string;
  mobileSales: string;
  otherSales: string;
  createdAt: string;
};

type User = { id: string; fullName: string; role: string; isActive?: boolean };

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function SalesPage() {
  const { t, tError } = useT();

  const [summaries, setSummaries] = useState<SalesSummary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function refresh() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; summaries: SalesSummary[] }>('/api/v1/sales-summaries'),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users').catch(() => ({ success: true as const, users: [] as User[] })),
    ])
      .then(([sRes, uRes]) => {
        setSummaries(sRes.summaries);
        setUsers(uRes.users.filter((u) => u.role === 'WAITER'));
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  const waiters = useMemo(
    () => users.filter((u) => u.isActive !== false).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [users]
  );

  const total = useMemo(
    () => summaries.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0),
    [summaries]
  );

  function nameFor(u: string | null): string {
    if (!u) return 'Unattributed';
    return users.find((x) => x.id === u)?.fullName ?? u.slice(0, 8);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userId) { setErr({ code: 'WAITER_REQUIRED', message: 'Select a waiter.' }); return; }
    if (!amount.trim()) { setErr({ code: 'AMOUNT_REQUIRED', message: 'Enter a sales amount.' }); return; }
    setBusy(true);
    try {
      await apiFetch('/api/v1/sales-summaries', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          userId,
          sourceReference: '',
          notes: notes.trim() || null,
          lines: [{ paymentMethod: 'OTHER', amount: amount.trim() }],
        }),
      });
      setUserId('');
      setAmount('');
      setNotes('');
      refresh();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader title={t('ops.sales.title')} subtitle={t('ops.sales.subtitle')} />

      <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <SelectField
            label='Waiter'
            value={userId}
            onChange={setUserId}
            options={[{ value: '', label: 'Select a waiter' }, ...waiters.map((u) => ({ value: u.id, label: u.fullName }))]}
            required
          />
          <DateField
            label={t('form.businessDate')}
            value={businessDate}
            onChange={setBusinessDate}
            required
          />
          <DecimalField
            label='Sales amount'
            value={amount}
            onChange={setAmount}
            placeholder='0.00'
            required
          />
        </div>

        <TextArea
          label={t('form.notesOptional')}
          value={notes}
          onChange={setNotes}
          rows={2}
        />

        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <SubmitButton busy={busy}>Record sales summary</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>Waiter</th>
              <th className='text-left px-3 py-2 font-medium'>Date</th>
              <th className='text-right px-3 py-2 font-medium'>Total</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && summaries.length === 0 && (
              <tr><td colSpan={3} className='px-3 py-6 text-center text-slate-400'>{t('ops.sales.empty')}</td></tr>
            )}
            {summaries.map((s) => (
              <tr key={s.id} className='border-t border-slate-100'>
                <td className='px-3 py-2'>{nameFor(s.userId)}</td>
                <td className='px-3 py-2 font-mono text-slate-600'>{s.businessDate}</td>
                <td className='px-3 py-2 text-right font-mono'>{s.totalSales}</td>
              </tr>
            ))}
            {!loading && summaries.length > 0 && (
              <tr className='border-t-2 border-slate-300 bg-slate-50 font-medium'>
                <td className='px-3 py-2' colSpan={2}>TOTAL</td>
                <td className='px-3 py-2 text-right font-mono'>{total.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
