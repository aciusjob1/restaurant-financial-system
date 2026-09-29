'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { KioskShell, KioskHeader } from '@/components/kiosk/KioskShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type Category = { id: string; name: string; isActive: boolean };

type Expense = {
  id: string;
  expenseNumber: string;
  businessDate: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  receiptNumber: string | null;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string | null;
  approvedAt: string | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function statusClass(s: Expense['status']): string {
  if (s === 'PENDING') return 'text-amber-700 font-medium';
  if (s === 'APPROVED') return 'text-emerald-700 font-medium';
  if (s === 'REJECTED') return 'text-red-700 font-medium';
  return 'text-slate-500';
}

export default function KioskExpensesPage() {
  const { t, tError } = useT();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [description, setDescription] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [catRes, expRes] = await Promise.all([
        apiFetch<{ success: true; categories: Category[] }>('/api/v1/expense-categories'),
        apiFetch<{ success: true; expenses: Expense[] }>('/api/v1/expenses'),
      ]);
      setCategories(catRes.categories);
      setExpenses(expRes.expenses);
      setErr(null);
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiFetch('/api/v1/expenses', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          categoryId,
          amount,
          paymentMethod,
          description,
          receiptNumber: receiptNumber || null,
          notes: notes || null,
        }),
      });
      setAmount('');
      setDescription('');
      setReceiptNumber('');
      setNotes('');
      await refresh();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setBusy(false);
    }
  }

  function categoryName(id: string): string {
    const c = categories.find((x) => x.id === id);
    return c ? c.name : id.slice(0, 8);
  }

  return (
    <KioskShell>
      <KioskHeader
        title={t('kiosk.expenses.title')}
        subtitle={t('kiosk.expenses.subtitle')}
      />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
        <>
          <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
            <h2 className='text-base font-medium text-slate-900'>
              {t('kiosk.expenses.recordHeading')}
            </h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <DateField
                label={t('form.businessDate')}
                value={businessDate}
                onChange={setBusinessDate}
                required
              />
              <SelectField
                label={t('form.category')}
                value={categoryId}
                onChange={setCategoryId}
                required
                options={[
                  { value: '', label: t('form.selectCategory') },
                  ...categories
                    .filter((c) => c.isActive)
                    .map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <DecimalField
                label={t('form.amount')}
                value={amount}
                onChange={setAmount}
                required
                placeholder='0.00'
              />
              <SelectField
                label={t('form.paymentMethod')}
                value={paymentMethod}
                onChange={setPaymentMethod}
                required
                options={PAYMENT_METHODS.map((m) => ({
                  value: m,
                  label: m.replace(/_/g, ' '),
                }))}
              />
              <TextField
                label={t('form.description')}
                value={description}
                onChange={setDescription}
                required
                placeholder={t('form.descriptionPlaceholder')}
              />
              <TextField
                label={t('form.receiptOptional')}
                value={receiptNumber}
                onChange={setReceiptNumber}
              />
            </div>
            <TextArea
              label={t('form.notesOptional')}
              value={notes}
              onChange={setNotes}
              rows={2}
            />
            <SubmitButton busy={busy}>
              {t('kiosk.expenses.recordButton')}
            </SubmitButton>
          </form>

          <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
            <h2 className='text-base font-medium text-slate-900'>
              {t('kiosk.expenses.listHeading')}
            </h2>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left px-2 py-2 font-medium'>{t('table.date')}</th>
                    <th className='text-left px-2 py-2 font-medium'>{t('table.category')}</th>
                    <th className='text-left px-2 py-2 font-medium'>{t('table.description')}</th>
                    <th className='text-right px-2 py-2 font-medium'>{t('table.amount')}</th>
                    <th className='text-left px-2 py-2 font-medium'>{t('table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className='px-2 py-3 text-center text-slate-400'>
                        {t('kiosk.expenses.empty')}
                      </td>
                    </tr>
                  )}
                  {expenses.map((e) => (
                    <tr key={e.id} className='border-t border-slate-100'>
                      <td className='px-2 py-2'>{e.businessDate}</td>
                      <td className='px-2 py-2'>{categoryName(e.categoryId)}</td>
                      <td className='px-2 py-2'>{e.description}</td>
                      <td className='px-2 py-2 text-right font-mono'>{e.amount}</td>
                      <td className='px-2 py-2'>
                        <span className={statusClass(e.status)}>{e.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </KioskShell>
  );
}
