'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { KioskShell, KioskHeader } from '@/components/kiosk/KioskShell';
import { FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { titleCaseName } from '@/lib/textCase';

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

type Employee = {
  id: string;
  fullName: string;
  employeeNumber: string;
  isActive: boolean;
};

type MyReceipt = {
  id: string;
  businessDate: string;
  status: 'PENDING' | 'APPROVED' | 'INSUFFICIENT' | 'NO_NETCASH_HANDED_OVER';
  amountReceived: string | null;
  decidedAt: string | null;
  updatedAt: string;
};

type MyResponse = {
  success: true;
  summary: Summary | null;
  activeExpenses: ActiveExpense[];
  mpesaEntries: Array<{ id: string; payerName: string; amount: string }>;
};

type MpesaRow = { key: string; name: string; amount: string };
type ExpenseRow = { key: string; categoryId: string; description: string; amount: string; salaryTargetEmployeeId: string };

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

export default function KioskPage() {
  const { t, tError } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mpesa, setMpesa] = useState<MpesaRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [myReceipt, setMyReceipt] = useState<MyReceipt | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [actingFor, setActingFor] = useState<string | null>(null);
  const [actingForName, setActingForName] = useState<string>('');
  const actingForRef = useRef<string | null>(null);

  async function load() {
    const asSuffix = actingForRef.current
      ? '&userId=' + encodeURIComponent(actingForRef.current)
      : '';
    setLoading(true);
    setErr(null);
    try {
      const meRes = await apiFetch<{ success: true; user: Me }>('/api/v1/auth/me');
      setMe(meRes.user);

      // Fetch categories before setting expense rows so we have a
      // default categoryId for the initial row. Waiters do not record
      // salaries, so SALARY is filtered out of the picker.
      const catRes = await apiFetch<{ success: true; categories: ExpenseCategory[] }>(
        '/api/v1/expense-categories?includeInactive=false',
      );
      const usable = catRes.categories;
      setCategories(usable);

      const empRes = await apiFetch<{ success: true; employees: Employee[] }>(
        '/api/v1/employees/for-kiosk',
      ).catch(() => ({ success: true as const, employees: [] as Employee[] }));
      setEmployees(empRes.employees);

      // The /for-kiosk endpoint returns the caller's own Employee record
      // only, or []. When exactly one is returned, prefill it on new
      // expense rows so the waiter does not have to pick from a
      // one-item dropdown.
      const onlyEmployee = empRes.employees.length === 1 ? empRes.employees[0].id : '';

      const myRes = await apiFetch<MyResponse>(
        '/api/v1/sales-summaries/mine?businessDate=' + todayISO() + asSuffix,
      );
      setSummary(myRes.summary);

      // Fetch the manager's decision on this waiter's most recent
      // submission, if any. The endpoint returns only the caller's own
      // receipt. This is a soft dependency: a failure does not block
      // the form.
      const receiptRes = await apiFetch<{ success: true; receipt: MyReceipt | null }>(
        '/api/v1/daily-cash-receipts/mine?businessDate=' + todayISO() + asSuffix,
      ).catch(() => ({ success: true as const, receipt: null as MyReceipt | null }));
      setMyReceipt(receiptRes.receipt);

      // If a submission exists, default to view mode so the waiter sees
      // what was submitted rather than an editable form. If nothing has
      // been submitted yet, there is nothing to view вЂ” stay in edit mode.
      setMode(receiptRes.receipt ? 'view' : 'edit');

      const mpesaRows = myRes.mpesaEntries ?? [];
      setMpesa(
        mpesaRows.length > 0
          ? mpesaRows.map((c) => ({
              key: uid(),
              name: c.payerName,
              amount: c.amount,
            }))
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
              salaryTargetEmployeeId: onlyEmployee,
            }))
          : [{ key: uid(), categoryId: usable[0]?.id ?? '', description: '', amount: '', salaryTargetEmployeeId: onlyEmployee }],
      );
    } catch (e) {
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
    // Parse ?as=<userId>&asName=<name> on mount. Manager/owner
    // "record on behalf" flow. The backend enforces the role check;
    // these params are display-only for the caller.
    const params = new URLSearchParams(window.location.search);
    const asId = params.get('as');
    const asName = params.get('asName');
    if (asId) {
      actingForRef.current = asId;
      setActingFor(asId);
      setActingForName(asName ?? '');
    }
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
  function updateExpense(key: string, field: 'categoryId' | 'description' | 'amount' | 'salaryTargetEmployeeId', v: string) {
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
    setExpenses((rows) => [...rows, {
      key: uid(),
      categoryId: categories[0]?.id ?? '',
      description: '',
      amount: '',
      salaryTargetEmployeeId: employees.length === 1 ? employees[0].id : '',
    }]);
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

    // Every SALARY row must have an employee selected before we send.
    const missingEmployee = expenses.some((r) => {
      const cat = categories.find((c) => c.id === r.categoryId);
      return cat?.systemKey === 'SALARY'
        && r.description.trim() !== ''
        && r.amount.trim() !== ''
        && !r.salaryTargetEmployeeId;
    });
    if (missingEmployee) {
      setErr({ code: 'EMPLOYEE_REQUIRED', message: t('kiosk.report.employeeRequired') });
      setBusy(false);
      return;
    }
    try {
      const mpesaEntries = mpesa
        .filter((r) => r.name.trim() !== '' && r.amount.trim() !== '')
        .map((r) => ({ payerName: r.name.trim(), amount: r.amount }));

      const expenseRows = expenses
        .filter((r) => r.categoryId && r.description.trim() !== '' && r.amount.trim() !== '')
        .map((r) => {
          const cat = categories.find((c) => c.id === r.categoryId);
          const isSalary = cat?.systemKey === 'SALARY';
          return {
            categoryId: r.categoryId,
            description: r.description.trim(),
            amount: r.amount,
            ...(isSalary ? { salaryTargetEmployeeId: r.salaryTargetEmployeeId } : {}),
          };
        });

      await apiFetch('/api/v1/sales-summaries/' + summary.id + '/waiter-collections', {
        method: 'POST',
        body: JSON.stringify({ mpesaEntries, expenses: expenseRows }),
      });

      setSaved(true);
      await load();
      setMode('view');
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
  const effectiveTitle = actingFor
    ? t('kiosk.report.actingForTitle') + ' ' + (actingForName || actingFor)
    : greeting;

  if (!summary) {
    return (
      <KioskShell>
        <KioskHeader title={effectiveTitle} />
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

  const noCategories = categories.length === 0;
  const noEmployee = employees.length === 0;

  // Once a manager approves the submission, the record is final from the
  // waiter's side. They must ask a manager to reopen it. For PENDING /
  // INSUFFICIENT / NO_NETCASH_HANDED_OVER the form stays editable; the
  // existing fingerprint logic will reset the status to PENDING on the
  // next resubmission if the figures changed.
  const locked = myReceipt?.status === 'APPROVED';
  const showResubmit = myReceipt !== null && myReceipt.status !== 'APPROVED';

  // The receipt view replaces the form when a submission exists and the
  // waiter has not clicked Badilisha. When there is nothing to show,
  // showReceipt is false and the form renders.
  const showReceipt = mode === 'view' && myReceipt !== null;
  const canEdit = !locked;

  return (
    <KioskShell>
      <KioskHeader title={effectiveTitle} subtitle={t('kiosk.report.subtitle')} />

      {actingFor && (
        <div className='rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900'>
          {t('kiosk.report.actingForBanner')}
        </div>
      )}

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {saved && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {t('kiosk.report.saved')}
        </div>
      )}
      {noCategories && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
          {t('kiosk.report.noCategories')}
        </div>
      )}

      

      {showReceipt && (
        <div className={
          'rounded-2xl border p-5 space-y-4 ' +
          (myReceipt!.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50' :
           myReceipt!.status === 'INSUFFICIENT' ? 'border-red-200 bg-red-50' :
           myReceipt!.status === 'NO_NETCASH_HANDED_OVER' ? 'border-slate-200 bg-slate-50' :
           'border-amber-200 bg-amber-50')
        }>
          <div className='flex items-center justify-between'>
            <span className='text-base font-medium text-slate-900'>
              {t('kiosk.report.receiptHeading')}
            </span>
            <span className='text-xs text-slate-500'>
              {myReceipt!.decidedAt ?? myReceipt!.updatedAt}
            </span>
          </div>

          <div className='text-sm text-slate-800'>
            {t('kiosk.report.statusLabel')}:{' '}
            <span className='font-medium'>
              {myReceipt!.status === 'PENDING' ? t('kiosk.report.status.pending') :
               myReceipt!.status === 'APPROVED' ? t('kiosk.report.status.approved') :
               myReceipt!.status === 'INSUFFICIENT' ? t('kiosk.report.status.insufficient') :
               t('kiosk.report.status.noNetcash')}
            </span>
          </div>

          {myReceipt!.status === 'INSUFFICIENT' && myReceipt!.amountReceived && (
            <>
              <div className='text-sm text-red-800'>
                {t('kiosk.report.amountReceived')}:{' '}
                <span className='font-mono'>{myReceipt!.amountReceived}</span>
              </div>
              <div className='text-sm text-red-800'>
                {t('kiosk.report.shortfall')}:{' '}
                <span className='font-mono'>
                  {money(num(summary!.totalSales) - mpesaTotal - expensesTotal - num(myReceipt!.amountReceived))}
                </span>
              </div>
            </>
          )}

          <div className='border-t border-slate-200 pt-3 space-y-2'>
            <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>
              {t('kiosk.report.mpesaHeading')}
            </div>
            {mpesa.filter((r) => r.name.trim() !== '' && r.amount.trim() !== '').length === 0 ? (
              <div className='text-sm text-slate-500'>{t('kiosk.report.receiptNoMpesa')}</div>
            ) : (
              <table className='w-full text-sm'>
                <tbody>
                  {mpesa.filter((r) => r.name.trim() !== '' && r.amount.trim() !== '').map((r) => (
                    <tr key={r.key}>
                      <td className='py-0.5 text-slate-700'>{r.name}</td>
                      <td className='py-0.5 text-right font-mono text-slate-900'>{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className='border-t border-slate-200 pt-3 space-y-2'>
            <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>
              {t('kiosk.report.expensesHeading')}
            </div>
            {expenses.filter((r) => r.description.trim() !== '' && r.amount.trim() !== '').length === 0 ? (
              <div className='text-sm text-slate-500'>{t('kiosk.report.receiptNoExpenses')}</div>
            ) : (
              <table className='w-full text-sm'>
                <tbody>
                  {expenses.filter((r) => r.description.trim() !== '' && r.amount.trim() !== '').map((r) => {
                    const cat = categories.find((c) => c.id === r.categoryId);
                    const catName = cat?.systemKey === 'SALARY'
                      ? t('expenseCategory.SALARY')
                      : (cat?.name ?? '\u2014');
                    return (
                      <tr key={r.key}>
                        <td className='py-0.5 text-slate-700'>
                          <span className='text-xs text-slate-500'>{catName}</span>{' / '}{r.description}
                        </td>
                        <td className='py-0.5 text-right font-mono text-slate-900'>{r.amount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className='border-t border-slate-200 pt-3 space-y-1'>
            <div className='flex items-center justify-between text-sm'>
              <span className='text-slate-600'>{t('kiosk.report.mpesaTotal')}</span>
              <span className='font-mono text-slate-900'>{money(mpesaTotal)}</span>
            </div>
            <div className='flex items-center justify-between text-sm'>
              <span className='text-slate-600'>{t('kiosk.report.expensesTotal')}</span>
              <span className='font-mono text-slate-900'>{money(expensesTotal)}</span>
            </div>
            <div className='flex items-center justify-between text-base font-medium pt-1 border-t border-slate-200'>
              <span className='text-slate-900'>{t('kiosk.report.netCash')}</span>
              <span className='font-mono text-slate-900'>{money(netCash)}</span>
            </div>
          </div>

          {myReceipt!.status === 'APPROVED' && (
            <div className='text-xs text-emerald-800 italic'>
              {t('kiosk.report.approvedLockedNote')}
            </div>
          )}

          {canEdit ? (
            <button
              type='button'
              onClick={() => setMode('edit')}
              className='w-full rounded-lg bg-slate-900 text-white py-3 text-base font-medium'
            >
              {t('kiosk.report.edit')}
            </button>
          ) : null}
        </div>
      )}

      {!showReceipt && (
      <form onSubmit={onSubmit} className='space-y-4'>
        <div className='rounded-2xl border border-slate-200 bg-slate-50 p-5'>
          <div className='text-sm text-slate-500'>
            {t('kiosk.report.readOnlyTotal')}
          </div>
          <div className='mt-1 text-3xl font-mono font-semibold text-slate-900'>
            {summary.totalSales}
          </div>
        </div>

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
                onBlur={(e) => {
                  const next = titleCaseName(e.target.value);
                  if (next !== row.name) updateMpesa(row.key, 'name', next);
                }}
                placeholder={t('kiosk.report.mpesaNamePlaceholder')}
                disabled={busy || locked}
              />
              <input
                type='text'
                inputMode='decimal'
                className={ROW_INPUT}
                value={row.amount}
                onChange={(e) => updateMpesa(row.key, 'amount', e.target.value)}
                placeholder='0.00'
                disabled={busy || locked}
              />
              <button
                type='button'
                aria-label={t('kiosk.report.removeRow')}
                onClick={() => removeMpesa(row.key)}
                disabled={busy || locked || mpesa.length === 1}
                className='text-slate-400 hover:text-red-600 disabled:opacity-30 text-lg leading-none'
              >
                ×
              </button>
            </div>
          ))}

          <button
            type='button'
            onClick={addMpesa}
            disabled={busy || locked}
            className='text-sm font-medium text-slate-600 hover:text-slate-900'
          >
            + {t('kiosk.report.addRow')}
          </button>
        </div>

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

          <div className='grid grid-cols-[1fr_1fr_1fr_1fr_2.5rem] gap-2 text-xs font-medium text-slate-600'>
            <div>{t('kiosk.report.expenseCategory')}</div>
            <div>{t('kiosk.report.expenseEmployee')}</div>
            <div>{t('kiosk.report.expenseDesc')}</div>
            <div>{t('kiosk.report.expenseAmount')}</div>
            <div />
          </div>

          {expenses.map((row) => (
            <div
              key={row.key}
              className='grid grid-cols-[1fr_1fr_1fr_1fr_2.5rem] gap-2 items-center'
            >
              <select
                className={ROW_INPUT}
                value={row.categoryId}
                onChange={(e) => updateExpense(row.key, 'categoryId', e.target.value)}
                disabled={busy || locked || noCategories}
              >
                {!row.categoryId && <option value=''>—</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {(() => {
                const cat = categories.find((c) => c.id === row.categoryId);
                const isSalary = cat?.systemKey === 'SALARY';
                if (!isSalary) {
                  return <div className='text-xs text-slate-400 self-center'>—</div>;
                }
                if (noEmployee) {
                  return (
                    <div className='text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 self-center'>
                      {t('kiosk.report.noEmployeeForKiosk')}
                    </div>
                  );
                }
                return (
                  <select
                    className={ROW_INPUT}
                    value={row.salaryTargetEmployeeId}
                    onChange={(e) => updateExpense(row.key, 'salaryTargetEmployeeId', e.target.value)}
                    disabled={busy || locked}
                  >
                    <option value=''>{t('kiosk.report.expenseEmployeeSelect')}</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeNumber})
                      </option>
                    ))}
                  </select>
                );
              })()}
              <input
                type='text'
                className={ROW_INPUT}
                value={row.description}
                onChange={(e) => updateExpense(row.key, 'description', e.target.value)}
                placeholder={t('kiosk.report.expenseDescPlaceholder')}
                disabled={busy || locked || (categories.find((c) => c.id === row.categoryId)?.systemKey === 'SALARY' && noEmployee)}
              />
              <input
                type='text'
                inputMode='decimal'
                className={ROW_INPUT}
                value={row.amount}
                onChange={(e) => updateExpense(row.key, 'amount', e.target.value)}
                placeholder='0.00'
                disabled={busy || locked || (categories.find((c) => c.id === row.categoryId)?.systemKey === 'SALARY' && noEmployee)}
              />
              <button
                type='button'
                aria-label={t('kiosk.report.removeRow')}
                onClick={() => removeExpense(row.key)}
                disabled={busy || locked || expenses.length === 1}
                className='text-slate-400 hover:text-red-600 disabled:opacity-30 text-lg leading-none'
              >
                ×
              </button>
            </div>
          ))}

          <button
            type='button'
            onClick={addExpense}
            disabled={busy || locked || noCategories}
            className='text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40'
          >
            + {t('kiosk.report.addRow')}
          </button>
        </div>

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

        {!locked && (
          <button
            type='submit'
            disabled={busy || noCategories}
            className='w-full rounded-lg bg-slate-900 text-white py-3 text-base font-medium disabled:opacity-60'
          >
            {busy
              ? t('kiosk.report.submitting')
              : showResubmit
                ? t('kiosk.report.resubmit')
                : t('kiosk.report.submit')}
          </button>
        )}

        {showResubmit && (
          <button
            type='button'
            onClick={() => { setMode('view'); load(); }}
            disabled={busy}
            className='w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-600 disabled:opacity-60'
          >
            {t('kiosk.report.cancelEdit')}
          </button>
        )}
      </form>
      )}
    </KioskShell>
  );
}