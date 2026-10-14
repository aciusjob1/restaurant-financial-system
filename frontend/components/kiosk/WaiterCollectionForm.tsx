'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { titleCaseName } from '@/lib/textCase';

type Summary = {
  id: string;
  businessDate: string;
  totalSales: string;
  cashSales: string;
  mobileSales: string;
  otherSales: string;
};

type ActiveExpense = {
  id: string;
  description: string;
  amount: string;
  categoryId: string;
  categoryName: string;
  categorySystemKey: string | null;
};

type ExpenseCategory = {
  id: string;
  name: string;
  systemKey: string | null;
  isActive: boolean;
};

type MyResponse = {
  success: true;
  summary: Summary | null;
  activeExpenses: ActiveExpense[];
  mpesaEntries: Array<{ id: string; payerName: string; amount: string }>;
};

type MpesaRow = { key: string; name: string; amount: string };
type ExpenseRow = { key: string; categoryId: string; description: string; amount: string };

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

export function WaiterCollectionForm({
  userId,
  waiterName,
  onSuccess,
  onCancel,
}: {
  userId: string;
  waiterName: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t, tError } = useT();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [mpesa, setMpesa] = useState<MpesaRow[]>([{ key: uid(), name: '', amount: '' }]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    Promise.all([
      apiFetch<{ success: true; categories: ExpenseCategory[] }>(
        '/api/v1/expense-categories?includeInactive=false',
      ),
      apiFetch<MyResponse>(
        '/api/v1/sales-summaries/mine?businessDate=' +
          todayISO() +
          '&userId=' +
          encodeURIComponent(userId),
      ),
    ])
      .then(([catRes, myRes]) => {
        const usable = catRes.categories.filter((c) => c.systemKey !== 'SALARY');
        setCategories(usable);
        setSummary(myRes.summary);

        const mpesaRows = myRes.mpesaEntries ?? [];
        setMpesa(
          mpesaRows.length > 0
            ? mpesaRows.map((c) => ({ key: uid(), name: c.payerName, amount: c.amount }))
            : [{ key: uid(), name: '', amount: '' }],
        );

        const activeExps = myRes.activeExpenses ?? [];
        setExpenses(
          activeExps.length > 0
            ? activeExps.map((e) => ({
                key: uid(),
                categoryId: e.categoryId,
                description: e.description,
                amount: e.amount,
              }))
            : [{ key: uid(), categoryId: usable[0]?.id ?? '', description: '', amount: '' }],
        );
      })
      .catch((e) => {
        setErr({
          code: e instanceof ApiError ? e.code : 'ERR',
          message: e instanceof ApiError ? e.message : 'Unable to load waiter data.',
        });
      })
      .finally(() => setLoading(false));
  }, [userId]);

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
    setMpesa((rows) =>
      rows.map((r) =>
        r.key === key ? { ...r, [field]: field === 'amount' ? sanitizeMoney(v) : v } : r,
      ),
    );
  }
  function addMpesa() {
    setMpesa((rows) => [...rows, { key: uid(), name: '', amount: '' }]);
  }
  function removeMpesa(key: string) {
    setMpesa((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }
  function updateExpense(key: string, field: 'categoryId' | 'description' | 'amount', v: string) {
    setExpenses((rows) =>
      rows.map((r) =>
        r.key === key ? { ...r, [field]: field === 'amount' ? sanitizeMoney(v) : v } : r,
      ),
    );
  }
  function addExpense() {
    setExpenses((rows) => [
      ...rows,
      { key: uid(), categoryId: categories[0]?.id ?? '', description: '', amount: '' },
    ]);
  }
  function removeExpense(key: string) {
    setExpenses((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;
    setBusy(true);
    setErr(null);
    try {
      const mpesaEntries = mpesa
        .filter((r) => r.name.trim() !== '' && r.amount.trim() !== '')
        .map((r) => ({ payerName: r.name.trim(), amount: r.amount }));

      const expenseRows = expenses
        .filter((r) => r.categoryId && r.description.trim() !== '' && r.amount.trim() !== '')
        .map((r) => ({
          categoryId: r.categoryId,
          description: r.description.trim(),
          amount: r.amount,
        }));

      await apiFetch('/api/v1/sales-summaries/' + summary.id + '/waiter-collections', {
        method: 'POST',
        body: JSON.stringify({ mpesaEntries, expenses: expenseRows }),
      });
      onSuccess();
    } catch (e) {
      setErr({
        code: e instanceof ApiError ? e.code : 'ERR',
        message: e instanceof ApiError ? e.message : 'Submit failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto'>
      <div className='bg-white rounded-2xl shadow-xl max-w-3xl w-full my-8 p-6 space-y-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-lg font-medium text-slate-900'>
            {t('ops.cashFlow.recordModal.heading')} {waiterName}
          </h2>
          <button
            type='button'
            onClick={onCancel}
            disabled={busy}
            className='text-slate-400 hover:text-slate-700 text-xl leading-none disabled:opacity-30'
          >
            &times;
          </button>
        </div>

        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

        {loading ? (
          <div className='text-slate-500'>{t('common.loading')}</div>
        ) : !summary ? (
          <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900'>
            {t('ops.cashFlow.recordModal.noSummary')}
          </div>
        ) : (
          <form onSubmit={onSubmit} className='space-y-4'>
            <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
              <div className='text-sm text-slate-500'>{t('kiosk.report.readOnlyTotal')}</div>
              <div className='mt-1 text-2xl font-mono font-semibold text-slate-900'>
                {summary.totalSales}
              </div>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
              <div className='flex items-center justify-between'>
                <h3 className='text-base font-medium text-slate-900'>
                  {t('kiosk.report.mpesaHeading')}
                </h3>
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
                <div key={row.key} className='grid grid-cols-[1fr_1fr_2.5rem] gap-2 items-center'>
                  <input
                    type='text'
                    className={ROW_INPUT}
                    value={row.name}
                    onChange={(e) => updateMpesa(row.key, 'name', e.target.value)}
                    onBlur={(e) => {
                      const next = titleCaseName(e.target.value);
                      if (next !== row.name) updateMpesa(row.key, 'name', next);
                    }}
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
                    &times;
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

            <div className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
              <div className='flex items-center justify-between'>
                <h3 className='text-base font-medium text-slate-900'>
                  {t('kiosk.report.expensesHeading')}
                </h3>
                <span className='text-sm text-slate-500'>
                  {t('kiosk.report.expensesTotal')}:{' '}
                  <span className='font-mono text-slate-900'>{money(expensesTotal)}</span>
                </span>
              </div>

              <div className='grid grid-cols-[1fr_1fr_1fr_2.5rem] gap-2 text-xs font-medium text-slate-600'>
                <div>{t('kiosk.report.expenseCategory')}</div>
                <div>{t('kiosk.report.expenseDesc')}</div>
                <div>{t('kiosk.report.expenseAmount')}</div>
                <div />
              </div>

              {expenses.map((row) => (
                <div key={row.key} className='grid grid-cols-[1fr_1fr_1fr_2.5rem] gap-2 items-center'>
                  <select
                    className={ROW_INPUT}
                    value={row.categoryId}
                    onChange={(e) => updateExpense(row.key, 'categoryId', e.target.value)}
                    disabled={busy}
                  >
                    {!row.categoryId && <option value=''>&mdash;</option>}
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
                    &times;
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

            <div className='rounded-2xl border-2 border-slate-900 bg-slate-50 p-4'>
              <div className='flex items-center justify-between'>
                <span className='text-base font-medium text-slate-900'>
                  {t('kiosk.report.netCash')}
                </span>
                <span className='text-2xl font-mono font-semibold text-slate-900'>
                  {money(netCash)}
                </span>
              </div>
            </div>

            <div className='flex gap-2 justify-end pt-2'>
              <button
                type='button'
                onClick={onCancel}
                disabled={busy}
                className='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60'
              >
                {t('action.cancel')}
              </button>
              <button
                type='submit'
                disabled={busy}
                className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
              >
                {busy ? t('kiosk.report.submitting') : t('kiosk.report.submit')}
              </button>
            </div>
          </form>
        )}

        {!loading && !summary && (
          <div className='flex gap-2 justify-end pt-2'>
            <button
              type='button'
              onClick={onCancel}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm'
            >
              {t('action.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}