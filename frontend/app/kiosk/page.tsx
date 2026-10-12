'use client';

import { useEffect, useMemo, useState } from 'react';
import { KioskShell, KioskHeader } from '@/components/kiosk/KioskShell';
import { FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Me = { id: string; fullName: string; role: string };

type SummaryLine = {
  id: string;
  paymentMethod: string;
  amount: string;
  notes: string | null;
};

type Summary = {
  id: string;
  businessDate: string;
  totalSales: string;
  cashSales: string;
  mobileSales: string;
  otherSales: string;
  lines: SummaryLine[];
};

type ActiveExpense = { description: string; amount: string };

type MyResponse = {
  success: true;
  summary: Summary | null;
  activeExpenses: ActiveExpense[];
};

type MpesaRow = { key: string; name: string; amount: string };
type ExpenseRow = { key: string; description: string; amount: string };

const ROW_INPUT =
  'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none font-mono disabled:bg-slate-50';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  return n.toFixed(2);
}

// Strip anything that is not part of a decimal number. Keeps a single
// leading minus and one decimal point. Prevents pastes like "5,000" or
// "500.00." from producing a bad payload.
function sanitizeMoney(v: string): string {
  let s = v.replace(/[^\d.-]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  if (neg) s = '-' + s;
  return s;
}

export default function KioskPage() {
  const { t, tError } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mpesa, setMpesa] = useState<MpesaRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const meRes = await apiFetch<{ success: true; user: Me }>('/api/v1/auth/me');
      setMe(meRes.user);

      const myRes = await apiFetch<MyResponse>(
        '/api/v1/sales-summaries/mine?businessDate=' + todayISO(),
      );
      setSummary(myRes.summary);

      const mpesaLines = (myRes.summary?.lines ?? []).filter(
        (l) => l.paymentMethod === 'MPESA',
      );
      setMpesa(
        mpesaLines.length > 0
          ? mpesaLines.map((l) => ({
              key: uid(),
              name: l.notes ?? '',
              amount: l.amount,
            }))
          : [{ key: uid(), name: '', amount: '' }],
      );

      const activeExps = myRes.activeExpenses ?? [];
      setExpenses(
        activeExps.length > 0
          ? activeExps.map((e) => ({
              key: uid(),
              description: e.description,
              amount: e.amount,
            }))
          : [{ key: uid(), description: '', amount: '' }],
      );
    } catch (e) {
      // 401 is handled by KioskShell. Anything else, surface here.
      if (!(e instanceof ApiError && e.status === 401)) {
        setErr({
          code: e instanceof ApiError ? e.code : 'ERR',
          message: e instanceof ApiError ? e.message : 'Unable to load report.',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mpesaTotal = useMemo(
    () => mpesa.reduce((sum, r) => sum + num(r.amount), 0),
    [mpesa],
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((sum, r) => sum + num(r.amount), 0),
    [expenses],
  );
  const totalSales = useMemo(() => num(summary?.totalSales ?? '0'), [summary]);
  const netCash = totalSales - mpesaTotal - expensesTotal;

  function updateMpesa(key: string, field: 'name' | 'amount', v: string) {
    setSaved(false);
    setMpesa((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, [field]: field === 'amount' ? sanitizeMoney(v) : v }
          : r,
      ),
    );
  }
  function addMpesa() {
    setSaved(false);
    setMpesa((rows) => [...rows, { key: uid(), name: '', amount: '' }]);
  }
  function removeMpesa(key: string) {
    setSaved(false);
    setMpesa((rows) =>
      rows.length === 1 ? rows : rows.filter((r) => r.key !== key),
    );
  }
  function updateExpense(key: string, field: 'description' | 'amount', v: string) {
    setSaved(false);
    setExpenses((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, [field]: field === 'amount' ? sanitizeMoney(v) : v }
          : r,
      ),
    );
  }
  function addExpense() {
    setSaved(false);
    setExpenses((rows) => [...rows, { key: uid(), description: '', amount: '' }]);
  }
  function removeExpense(key: string) {
    setSaved(false);
    setExpenses((rows) =>
      rows.length === 1 ? rows : rows.filter((r) => r.key !== key),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const mpesaRows = mpesa
        .filter((r) => r.name.trim() !== '' && r.amount.trim() !== '')
        .map((r) => ({ name: r.name.trim(), amount: r.amount }));

      const expenseRows = expenses
        .filter((r) => r.description.trim() !== '' && r.amount.trim() !== '')
        .map((r) => ({ description: r.description.trim(), amount: r.amount }));

      await apiFetch('/api/v1/sales-summaries/' + summary.id + '/waiter-report', {
        method: 'POST',
        body: JSON.stringify({ mpesaRows, expenseRows }),
      });

      setSaved(true);
      await load(); // refetch to pick up canonical state
    } catch (e) {
      setErr({
        code: e instanceof ApiError ? e.code : 'ERR',
        message: e instanceof ApiError ? e.message : 'Submit failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <KioskShell>
        <KioskHeader
          title={t('kiosk.home.brandTitle')}
          subtitle={t('kiosk.home.loadingSubtitle')}
        />
      </KioskShell>
    );
  }

  if (!me) return null;

  const greeting = t('kiosk.home.greetingPrefix') + me.fullName.split(' ')[0];

  // Model B: nothing to fill in until the manager enters the day's sales.
  if (!summary) {
    return (
      <KioskShell>
        <KioskHeader title={greeting} />
        <div className='rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-2'>
          <div className='text-lg font-medium text-amber-900'>
            {t('kiosk.report.noSales.heading')}
          </div>
          <div className='text-sm text-amber-800'>
            {t('kiosk.report.noSales.body')}
          </div>
        </div>
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <KioskHeader title={greeting} subtitle={t('kiosk.report.subtitle')} />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {saved && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {t('kiosk.report.saved')}
        </div>
      )}

      <form onSubmit={onSubmit} className='space-y-4'>
        {/* Total Sales — read only, entered upstream */}
        <div className='rounded-2xl border border-slate-200 bg-slate-50 p-5'>
          <div className='text-sm text-slate-500'>
            {t('kiosk.report.readOnlyTotal')}
          </div>
          <div className='mt-1 text-3xl font-mono font-semibold text-slate-900'>
            {summary.totalSales}
          </div>
        </div>

        {/* M-Pesa rows */}
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-medium text-slate-900'>
              {t('kiosk.report.mpesaHeading')}
            </h2>
            <span className='text-sm text-slate-500'>
              {t('kiosk.report.mpesaTotal')}:{' '}
              <span className='font-mono text-slate-900'>{money(mpesaTotal)}</span>
            </span>
          </div>

          <div className='grid grid-cols-[1fr_1fr_2.5rem] gap-2 text-xs font-medium text-slate-600'>
            <div>{t('kiosk.report.mpesaName')}</div>
            <div>{t('kiosk.report.mpesaAmount')}</div>
            <div />
          </div>

          {mpesa.map((row) => (
            <div
              key={row.key}
              className='grid grid-cols-[1fr_1fr_2.5rem] gap-2 items-center'
            >
              <input
                type='text'
                className={ROW_INPUT}
                value={row.name}
                onChange={(e) => updateMpesa(row.key, 'name', e.target.value)}
                placeholder={t('kiosk.report.mpesaNamePlaceholder')}
                disabled={busy}
              />
              <input
                type='text'
                inputMode='decimal'
                className={ROW_INPUT}
                value={row.amount}
                onChange={(e) => updateMpesa(row.key, 'amount', e.target.value)}
                placeholder='0.00'
                disabled={busy}
              />
              <button
                type='button'
                aria-label={t('kiosk.report.removeRow')}
                onClick={() => removeMpesa(row.key)}
                disabled={busy || mpesa.length === 1}
                className='text-slate-400 hover:text-red-600 disabled:opacity-30 text-lg leading-none'
              >
                ×
              </button>
            </div>
          ))}

          <button
            type='button'
            onClick={addMpesa}
            disabled={busy}
            className='text-sm font-medium text-slate-600 hover:text-slate-900'
          >
            + {t('kiosk.report.addRow')}
          </button>
        </div>

        {/* Expenses rows */}
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-medium text-slate-900'>
              {t('kiosk.report.expensesHeading')}
            </h2>
            <span className='text-sm text-slate-500'>
              {t('kiosk.report.expensesTotal')}:{' '}
              <span className='font-mono text-slate-900'>
                {money(expensesTotal)}
              </span>
            </span>
          </div>

          <div className='grid grid-cols-[1fr_1fr_2.5rem] gap-2 text-xs font-medium text-slate-600'>
            <div>{t('kiosk.report.expenseDesc')}</div>
            <div>{t('kiosk.report.expenseAmount')}</div>
            <div />
          </div>

          {expenses.map((row) => (
            <div
              key={row.key}
              className='grid grid-cols-[1fr_1fr_2.5rem] gap-2 items-center'
            >
              <input
                type='text'
                className={ROW_INPUT}
                value={row.description}
                onChange={(e) => updateExpense(row.key, 'description', e.target.value)}
                placeholder={t('kiosk.report.expenseDescPlaceholder')}
                disabled={busy}
              />
              <input
                type='text'
                inputMode='decimal'
                className={ROW_INPUT}
                value={row.amount}
                onChange={(e) => updateExpense(row.key, 'amount', e.target.value)}
                placeholder='0.00'
                disabled={busy}
              />
              <button
                type='button'
                aria-label={t('kiosk.report.removeRow')}
                onClick={() => removeExpense(row.key)}
                disabled={busy || expenses.length === 1}
                className='text-slate-400 hover:text-red-600 disabled:opacity-30 text-lg leading-none'
              >
                ×
              </button>
            </div>
          ))}

          <button
            type='button'
            onClick={addExpense}
            disabled={busy}
            className='text-sm font-medium text-slate-600 hover:text-slate-900'
          >
            + {t('kiosk.report.addRow')}
          </button>
        </div>

        {/* Net cash */}
        <div className='rounded-2xl border-2 border-slate-900 bg-slate-50 p-5'>
          <div className='flex items-center justify-between'>
            <span className='text-base font-medium text-slate-900'>
              {t('kiosk.report.netCash')}
            </span>
            <span className='text-2xl font-mono font-semibold underline decoration-2 underline-offset-4 text-slate-900'>
              {money(netCash)}
            </span>
          </div>
        </div>

        <button
          type='submit'
          disabled={busy}
          className='w-full rounded-lg bg-slate-900 text-white py-3 text-base font-medium disabled:opacity-60'
        >
          {busy ? t('kiosk.report.submitting') : t('kiosk.report.submit')}
        </button>
      </form>
    </KioskShell>
  );
}