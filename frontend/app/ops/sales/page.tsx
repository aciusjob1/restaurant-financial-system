'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DateField, DecimalField, SelectField, TextArea, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

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

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function SalesPage() {
  const { t, tError } = useT();

  const [summaries, setSummaries] = useState<SalesSummary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Form fields — independent of the table filter.
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Table filter. Defaults to today: the manager's main question is
  // "did everyone get entered today?"
  const [filterDate, setFilterDate] = useState(todayISO());

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function refresh() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; summaries: SalesSummary[] }>(
        '/api/v1/sales-summaries?businessDate=' + filterDate,
      ),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users').catch(() => ({
        success: true as const,
        users: [] as User[],
      })),
    ])
      .then(([sRes, uRes]) => {
        setSummaries(sRes.summaries);
        setUsers(uRes.users.filter((u) => u.role === 'WAITER'));
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate]);

  const waiters = useMemo(
    () =>
      users
        .filter((u) => u.isActive !== false)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [users],
  );

  // Total of the rows currently displayed (filtered by filterDate).
  const total = useMemo(
    () => summaries.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0),
    [summaries],
  );

  function nameFor(u: string | null): string {
    if (!u) return t('ops.sales.unattributed');
    return users.find((x) => x.id === u)?.fullName ?? u.slice(0, 8);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userId) {
      setErr({ code: 'WAITER_REQUIRED', message: t('ops.sales.waiterRequired') });
      return;
    }
    if (!amount.trim()) {
      setErr({ code: 'AMOUNT_REQUIRED', message: t('ops.sales.amountRequired') });
      return;
    }
    setBusy(true);
    try {
      // Model B: manager records the waiter's Total Sales for the day.
      // The waiter fills in the M-Pesa breakdown from the kiosk later.
      // lines is intentionally empty — the previous "OTHER" line caused
      // otherSales to equal the full total, which then made the kiosk's
      // cash calculation go negative on submission.
      await apiFetch('/api/v1/sales-summaries', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          userId,
          sourceReference: '',
          notes: notes.trim() || null,
          totalSales: amount.trim(),
          lines: [],
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

      <form
        onSubmit={submit}
        className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'
      >
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <SelectField
            label={t('ops.sales.waiterLabel')}
            value={userId}
            onChange={setUserId}
            options={[
              { value: '', label: t('ops.sales.selectWaiter') },
              ...waiters.map((u) => ({ value: u.id, label: u.fullName })),
            ]}
            required
          />
          <DateField
            label={t('form.businessDate')}
            value={businessDate}
            onChange={setBusinessDate}
            required
          />
          <DecimalField
            label={t('ops.sales.amountLabel')}
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
        <SubmitButton busy={busy}>{t('ops.sales.recordButton')}</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <div className='p-3 border-b border-slate-100 flex items-center gap-3'>
          <label className='text-sm text-slate-600'>
            {t('ops.sales.filterDate')}
          </label>
          <input
            type='date'
            className='rounded-lg border border-slate-300 px-3 py-1 text-sm'
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>
                {t('ops.sales.colWaiter')}
              </th>
              <th className='text-left px-3 py-2 font-medium'>
                {t('ops.sales.colDate')}
              </th>
              <th className='text-left px-3 py-2 font-medium'>
                {t('ops.sales.colSource')}
              </th>
              <th className='text-right px-3 py-2 font-medium'>
                {t('ops.sales.colTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className='px-3 py-6 text-center text-slate-400'>
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!loading && summaries.length === 0 && (
              <tr>
                <td colSpan={4} className='px-3 py-6 text-center text-slate-400'>
                  {t('ops.sales.empty')}
                </td>
              </tr>
            )}
            {summaries.map((s) => (
              <tr key={s.id} className='border-t border-slate-100'>
                <td className='px-3 py-2'>{nameFor(s.userId)}</td>
                <td className='px-3 py-2 font-mono text-slate-600'>{s.businessDate}</td>
                <td className='px-3 py-2'>
                  <span className='text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700'>
                    {s.source}
                  </span>
                </td>
                <td className='px-3 py-2 text-right font-mono'>{s.totalSales}</td>
              </tr>
            ))}
            {!loading && summaries.length > 0 && (
              <tr className='border-t-2 border-slate-300 bg-slate-50 font-medium'>
                <td className='px-3 py-2' colSpan={3}>
                  {t('ops.sales.colTotalLabel')}
                </td>
                <td className='px-3 py-2 text-right font-mono'>{total.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}