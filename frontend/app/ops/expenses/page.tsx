'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  TextField,
  DecimalField,
  DateField,
  SelectField,
  TextArea,
  FormError,
  SubmitButton,
} from '@/components/ops/Form';
import { ConfirmDialog } from '@/components/ops/ConfirmDialog';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type ExpenseCategory = { id: string; name: string; isActive: boolean };

type Expense = {
  id: string;
  expenseNumber: string;
  businessDate: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  createdBy: string;
  paidByUserId: string | null;
};

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

type ListCategoriesResponse = { success: true; categories: ExpenseCategory[] };
type ListExpensesResponse = { success: true; expenses: Expense[] };
type OneExpenseResponse = { success: true; expense: Expense };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusPill(status: string): string {
  switch (status) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-700';
    case 'PENDING':  return 'bg-amber-50 text-amber-700';
    case 'REJECTED': return 'bg-red-50 text-red-700';
    default:         return 'bg-slate-100 text-slate-600';
  }
}

function statusLabelKey(status: string): keyof Dict {
  if (status === 'PENDING') return 'status.pending';
  if (status === 'APPROVED') return 'status.approved';
  if (status === 'REJECTED') return 'status.rejected';
  return 'status.draft';
}

function ExpensesContent() {
  const { t, tError } = useT();
  const [rows, setRows] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string; username: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [includeRejected, setIncludeRejected] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paidByUserId, setPaidByUserId] = useState('');
  const [description, setDescription] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const reload = useCallback(
    async (status: string, withRejected: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const p = new URLSearchParams();
        if (status) p.set('status', status);
        p.set('includeRejected', withRejected ? 'true' : 'false');
        const res = await apiFetch<ListExpensesResponse>(OPS_PATHS.expenses + '?' + p.toString());
        setRows(res.expenses);
      } catch (e) {
        if (e instanceof ApiError) setError({ code: e.code, message: e.message });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    apiFetch<ListCategoriesResponse>(OPS_PATHS.expenseCategories)
      .then((res) => {
        setCategories(res.categories);
        if (res.categories.length > 0 && !categoryId) setCategoryId(res.categories[0].id);
      })
      .catch(() => {});
    apiFetch<MeResponse>('/api/v1/auth/me')
      .then((res) => { setMyId(res.user.id); setMyRole(res.user.role); })
      .catch(() => {});
    apiFetch<{ success: true; users: Array<{ id: string; fullName: string; username: string }> }>('/api/v1/users')
      .then((res) => setUsers(res.users))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void reload(statusFilter, includeRejected); }, [reload, statusFilter, includeRejected]);

  async function onCreate(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        businessDate,
        categoryId,
        amount: amount.trim(),
        paymentMethod,
        description: description.trim(),
      };
      if (paidByUserId) body.paidByUserId = paidByUserId;
      if (receiptNumber.trim()) body.receiptNumber = receiptNumber.trim();
      if (notes.trim()) body.notes = notes.trim();
      await apiFetch<OneExpenseResponse>(OPS_PATHS.expenses, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAmount('');
      setDescription('');
      setReceiptNumber('');
      setNotes('');
      setPaidByUserId('');
      await reload(statusFilter, includeRejected);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: 'submit' | 'approve') {
    setError(null);
    try {
      await apiFetch<OneExpenseResponse>(OPS_PATHS.expenses + '/' + id + '/' + action, {
        method: 'POST',
      });
      await reload(statusFilter, includeRejected);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setRejectBusy(true);
    setError(null);
    try {
      await apiFetch<OneExpenseResponse>(OPS_PATHS.expenses + '/' + rejectTarget.id + '/reject', {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setRejectTarget(null);
      setRejectReason('');
      await reload(statusFilter, includeRejected);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setRejectBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.expenses.title')}
        subtitle={t('ops.expenses.subtitle')}
      />

      {error && <FormError code={error.code} message={tError(error.code, error.message)} />}

      {categories.length === 0 && !loading && (
        <div className='rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'>
          {t('ops.expenses.noCategories.before')}
          <a href='/ops/expense-categories' className='underline'>/ops/expense-categories</a>
          {t('ops.expenses.noCategories.after')}
        </div>
      )}

      <form onSubmit={onCreate} className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
          <SelectField
            label={t('form.category')}
            value={categoryId}
            onChange={setCategoryId}
            required
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <DecimalField label={t('form.amount')} value={amount} onChange={setAmount} placeholder='0.00' required />
          <SelectField
            label={t('form.paymentMethod')}
            value={paymentMethod}
            onChange={setPaymentMethod}
            required
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          />
          <SelectField
            label={t('form.paidBy')}
            value={paidByUserId}
            onChange={setPaidByUserId}
            options={[{ value: '', label: t('common.notSpecified') }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]}
          />
        </div>
        <TextField label={t('form.description')} value={description} onChange={setDescription} required />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <TextField label={t('form.receiptNumber')} value={receiptNumber} onChange={setReceiptNumber} placeholder={t('common.optional')} />
        </div>
        <TextArea label={t('form.notes')} value={notes} onChange={setNotes} placeholder={t('common.optional')} />
        <SubmitButton busy={busy}>{t('action.createExpense')}</SubmitButton>
      </form>

      <div className='flex flex-wrap items-center gap-4 justify-between'>
        <div className='flex items-center gap-4'>
          <SelectField
            label={t('table.status')}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: t('status.all') },
              { value: 'DRAFT', label: t('status.draft') },
              { value: 'PENDING', label: t('status.pending') },
              { value: 'APPROVED', label: t('status.approved') },
              { value: 'REJECTED', label: t('status.rejected') },
            ]}
          />
          <label className='text-sm text-slate-600 flex items-center gap-2 self-end pb-2'>
            <input
              type='checkbox'
              checked={includeRejected}
              onChange={(e) => setIncludeRejected(e.target.checked)}
            />
            {t('common.includeRejected')}
          </label>
        </div>
        {loading && <span className='text-xs text-slate-400'>{t('common.loading')}</span>}
      </div>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50 text-slate-600'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>{t('table.date')}</th>
              <th className='text-left px-3 py-2 font-medium'>#</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.description')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.amount')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.method')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('form.paidBy')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.action')}</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className='px-3 py-6 text-center text-slate-500'>{t('ops.expenses.empty')}</td>
              </tr>
            )}
            {rows.map((x) => (
              <tr key={x.id} className='hover:bg-slate-50'>
                <td className='px-3 py-2 text-slate-700'>{x.businessDate}</td>
                <td className='px-3 py-2 font-mono text-xs text-slate-500'>{x.expenseNumber}</td>
                <td className='px-3 py-2 text-slate-800'>{x.description}</td>
                <td className='px-3 py-2 text-right font-mono text-slate-700'>{x.amount}</td>
                <td className='px-3 py-2 text-slate-600'>{x.paymentMethod}</td>
                <td className='px-3 py-2 text-slate-600'>{users.find((u) => u.id === x.paidByUserId)?.fullName ?? '\u2014'}</td>
                <td className='px-3 py-2'>
                  <span className={'text-xs px-2 py-0.5 rounded-full ' + statusPill(x.status)}>
                    {t(statusLabelKey(x.status))}
                  </span>
                </td>
                <td className='px-3 py-2 text-right space-x-3 whitespace-nowrap'>
                  {x.status === 'DRAFT' && (
                    <button type='button' onClick={() => act(x.id, 'submit')} className='text-xs text-blue-700 hover:underline'>
                      {t('action.submit')}
                    </button>
                  )}
                  {x.status === 'PENDING' && myId && x.createdBy !== myId && (
                    <>
                      <button type='button' onClick={() => act(x.id, 'approve')} className='text-xs text-emerald-700 hover:underline'>
                        {t('action.approve')}
                      </button>
                      <button type='button' onClick={() => { setRejectTarget(x); setRejectReason(''); }} className='text-xs text-red-700 hover:underline'>
                        {t('action.reject')}
                      </button>
                    </>
                  )}
                  {x.status === 'PENDING' && myId && x.createdBy === myId && myRole === 'OWNER' && (
                    <button type='button' onClick={() => act(x.id, 'approve')} className='text-xs text-amber-700 hover:underline'>
                      {t('action.approveSelf')}
                    </button>
                  )}
                  {x.status === 'PENDING' && myId && x.createdBy === myId && myRole !== 'OWNER' && (
                    <span className='text-xs text-slate-400'>{t('common.awaitingApprover')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={rejectTarget !== null}
        title={t('ops.expenses.rejectDialogTitle')}
        danger
        busy={rejectBusy}
        confirmLabel={t('action.reject')}
        body={
          <div>
            <p className='mb-2'>
              {t('ops.expenses.rejectPrompt.before')}
              <span className='font-mono'>{rejectTarget?.expenseNumber}</span>
              {t('ops.expenses.rejectPrompt.mid')}
              {rejectTarget?.amount}
              {t('ops.expenses.rejectPrompt.after')}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder={t('ops.expenses.rejectReasonPlaceholder')}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
            />
          </div>
        }
        onConfirm={confirmReject}
        onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
      />
    </OpsShell>
  );
}

export default function Page() {
  return <ExpensesContent />;
}
