'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DecimalField, SelectField, TextField, FormError,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type Shift = {
  id: string;
  userId?: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
};

type Collection = {
  id: string;
  shiftId: string;
  amount: string;
  voidedAt: string | null;
};

type Reconciliation = {
  id: string;
  shiftId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
};

type Handover = {
  id: string;
  reconciliationId: string;
  amount: string;
  status: 'PENDING' | 'CONFIRMED';
};

type Expense = {
  id: string;
  expenseNumber: string;
  shiftId: string | null;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  status: string;
};

type ExpenseCategory = { id: string; name: string; isActive: boolean };

type User = { id: string; fullName: string; role: string };
type Closing = { id: string; businessDate: string; status: string };

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type FlowState =
  | 'open'
  | 'awaiting_recon'
  | 'awaiting_review'
  | 'awaiting_handover'
  | 'awaiting_confirm'
  | 'awaiting_close_mid'
  | 'ready_to_close'
  | 'closed';

function deriveState(
  shift: Shift,
  recon: Reconciliation | undefined,
  handover: Handover | undefined,
): FlowState {
  if (shift.status === 'CLOSED') return 'closed';
  if (shift.status === 'RECONCILING') return 'ready_to_close';
  if (shift.status === 'OPEN') return 'open';
  if (!recon) return 'awaiting_recon';
  if (recon.status === 'DRAFT') return 'awaiting_recon';
  if (!handover) {
    if (recon.status === 'SUBMITTED') return 'awaiting_review';
    return 'awaiting_handover';
  }
  if (handover.status === 'PENDING') return 'awaiting_confirm';
  return 'awaiting_close_mid';
}

function stateKey(s: FlowState): keyof Dict {
  if (s === 'open') return 'ops.cashFlow.row.open';
  if (s === 'awaiting_recon') return 'ops.cashFlow.row.awaitingRecon';
  if (s === 'awaiting_review') return 'ops.cashFlow.row.awaitingReview';
  if (s === 'awaiting_handover') return 'ops.cashFlow.row.awaitingHandover';
  if (s === 'awaiting_confirm') return 'ops.cashFlow.row.awaitingConfirm';
  if (s === 'awaiting_close_mid') return 'ops.cashFlow.row.awaitingCloseMid';
  if (s === 'ready_to_close') return 'ops.cashFlow.row.readyToClose';
  return 'ops.cashFlow.row.closed';
}

function statePillClass(s: FlowState): string {
  if (s === 'closed') return 'bg-slate-100 text-slate-500';
  if (s === 'ready_to_close' || s === 'awaiting_close_mid') return 'bg-emerald-100 text-emerald-700';
  if (s === 'awaiting_confirm' || s === 'awaiting_review') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4'>
      <div className='text-xs uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='mt-1 text-2xl font-mono text-slate-900'>{value}</div>
    </div>
  );
}

type Row = {
  shift: Shift;
  total: string;
  expenseTotal: number;
  state: FlowState;
  name: string;
  recon: Reconciliation | undefined;
  handover: Handover | undefined;
};

export default function CashPage() {
  const { t, tError } = useT();
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recons, setRecons] = useState<Reconciliation[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState<string>('');
  const [myRole, setMyRole] = useState<string>('');
  const [todayClosing, setTodayClosing] = useState<Closing | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmHandoverId, setConfirmHandoverId] = useState<string | null>(null);
  const [confirmHandoverNotes, setConfirmHandoverNotes] = useState('');
  const [sendBackReconId, setSendBackReconId] = useState<string | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [closeShiftId, setCloseShiftId] = useState<string | null>(null);
  const [closeDayConfirming, setCloseDayConfirming] = useState(false);

  // inline expense form state
  const [expenseShiftId, setExpenseShiftId] = useState<string | null>(null);
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<string>('CASH');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePaidByUserId, setExpensePaidByUserId] = useState('');
  const [expenseBusy, setExpenseBusy] = useState(false);

  function load() {
    setLoading(true);
    const today = todayISO();
    Promise.all([
      apiFetch<{ success: true; shifts: Shift[] }>(OPS_PATHS.shifts),
      apiFetch<{ success: true; collections: Collection[] }>(OPS_PATHS.collections),
      apiFetch<{ success: true; reconciliations: Reconciliation[] }>(OPS_PATHS.reconciliations),
      apiFetch<{ success: true; handovers: Handover[] }>(OPS_PATHS.handovers),
      apiFetch<{ success: true; expenses: Expense[] }>('/api/v1/expenses?businessDate=' + today).catch(() => ({ success: true as const, expenses: [] as Expense[] })),
      apiFetch<{ success: true; categories: ExpenseCategory[] }>('/api/v1/expense-categories').catch(() => ({ success: true as const, categories: [] as ExpenseCategory[] })),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users').catch(() => ({ success: true as const, users: [] as User[] })),
      apiFetch<{ success: true; user: User }>('/api/v1/auth/me').catch(() => ({ success: true as const, user: { id: '', fullName: '', role: '' } })),
      apiFetch<{ success: true; closings: Closing[] }>('/api/v1/daily-closings?businessDate=' + today).catch(() => ({ success: true as const, closings: [] as Closing[] })),
    ])
      .then(([sRes, cRes, rRes, hRes, eRes, catRes, uRes, meRes, dRes]) => {
        setShifts(sRes.shifts.filter((s) => s.businessDate === today));
        setCollections(cRes.collections);
        setRecons(rRes.reconciliations);
        setHandovers(hRes.handovers);
        setExpenses(eRes.expenses);
        setCategories(catRes.categories.filter((c) => c.isActive));
        setUsers(uRes.users);
        setMyId(meRes.user.id);
        setMyRole(meRes.user.role);
        setTodayClosing(dRes.closings.length > 0 ? dRes.closings[0] : null);
      })
      .catch((e) => { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const rows: Row[] = useMemo(() => {
    return shifts.map((s) => {
      const coll = collections.filter((c) => c.shiftId === s.id && !c.voidedAt);
      const total = coll.reduce((acc, c) => acc + parseFloat(c.amount), 0);
      const rowExpenses = expenses.filter((e) => e.shiftId === s.id);
      const expenseTotal = rowExpenses.reduce((acc, e) => acc + parseFloat(e.amount), 0);
      const recon = recons.find((r) => r.shiftId === s.id);
      const handover = recon ? handovers.find((h) => h.reconciliationId === recon.id) : undefined;
      const state = deriveState(s, recon, handover);
      const name =
        users.find((u) => u.id === s.userId)?.fullName ??
        (s.userId ? s.userId.slice(0, 8) : '\u2014');
      return { shift: s, total: total.toFixed(2), expenseTotal, state, name, recon, handover };
    });
  }, [shifts, collections, recons, handovers, expenses, users]);

  const summary = useMemo(() => {
    let open = 0; let awaitingReview = 0; let awaitingConfirm = 0; let readyToClose = 0;
    for (const r of rows) {
      if (r.state === 'open' || r.state === 'awaiting_recon') open++;
      if (r.state === 'awaiting_review') awaitingReview++;
      if (r.state === 'awaiting_confirm') awaitingConfirm++;
      if (r.state === 'ready_to_close' || r.state === 'awaiting_close_mid') readyToClose++;
    }
    return { open, awaitingReview, awaitingConfirm, readyToClose };
  }, [rows]);

  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';
  const isOwner = myRole === 'OWNER';
  const allClosed = rows.length > 0 && rows.every((r) => r.state === 'closed');

  function clearInline() {
    setConfirmHandoverId(null); setConfirmHandoverNotes('');
    setSendBackReconId(null); setSendBackReason('');
    setCloseShiftId(null); setCloseDayConfirming(false);
    setExpenseShiftId(null); setExpenseAmount(''); setExpenseDescription('');
    setExpenseCategoryId(''); setExpenseMethod('CASH'); setExpensePaidByUserId('');
  }

  function openExpenseForm(shift: Shift) {
    setErr(null); setFlash(null);
    setExpenseShiftId(shift.id);
    setExpenseCategoryId(categories.length > 0 ? categories[0].id : '');
    setExpenseAmount('');
    setExpenseMethod('CASH');
    setExpenseDescription('');
    setExpensePaidByUserId(shift.userId ?? '');
  }

  async function submitExpense(e: FormEvent, shift: Shift) {
    e.preventDefault();
    setErr(null); setFlash(null);
    if (!expenseCategoryId) { setErr({ code: 'CATEGORY_REQUIRED', message: 'Select a category.' }); return; }
    if (!expenseAmount.trim()) { setErr({ code: 'AMOUNT_REQUIRED', message: 'Amount is required.' }); return; }
    if (!expenseDescription.trim()) { setErr({ code: 'DESC_REQUIRED', message: 'Description is required.' }); return; }
    setExpenseBusy(true);
    try {
      const body: Record<string, unknown> = {
        businessDate: shift.businessDate,
        categoryId: expenseCategoryId,
        shiftId: shift.id,
        amount: expenseAmount.trim(),
        paymentMethod: expenseMethod,
        description: expenseDescription.trim(),
      };
      if (expensePaidByUserId) body.paidByUserId = expensePaidByUserId;
      if (isOwner) body.autoApprove = true;
      else if (myRole === 'MANAGER') body.submitNow = true;
      await apiFetch('/api/v1/expenses', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setFlash(t('ops.cashFlow.flash.expenseRecorded'));
      clearInline();
      load();
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setExpenseBusy(false);
    }
  }

  async function doConfirmHandover(hid: string) {
    setErr(null); setBusyKey('ho:' + hid);
    try {
      await apiFetch('/api/v1/handovers/' + hid + '/confirm', {
        method: 'POST',
        body: JSON.stringify({ confirmedNotes: confirmHandoverNotes.trim() === '' ? undefined : confirmHandoverNotes.trim() }),
      });
      clearInline(); load();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  async function doApprove(reconId: string) {
    setErr(null); setBusyKey('rv:' + reconId);
    try {
      await apiFetch('/api/v1/reconciliations/' + reconId + '/review', {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVE' }),
      });
      load();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  async function doSendBack(reconId: string) {
    if (sendBackReason.trim().length < 3) return;
    setErr(null); setBusyKey('sb:' + reconId);
    try {
      await apiFetch('/api/v1/reconciliations/' + reconId + '/review', {
        method: 'POST',
        body: JSON.stringify({ decision: 'SEND_BACK', reviewNotes: sendBackReason.trim() }),
      });
      clearInline(); load();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  async function doCloseShift(shiftId: string, currentStatus: string) {
    setErr(null); setBusyKey('cs:' + shiftId);
    try {
      if (currentStatus === 'SUBMITTED') {
        await apiFetch('/api/v1/shifts/' + shiftId + '/transition', {
          method: 'POST', body: JSON.stringify({ to: 'RECONCILING' }),
        });
      }
      await apiFetch('/api/v1/shifts/' + shiftId + '/transition', {
        method: 'POST', body: JSON.stringify({ to: 'CLOSED' }),
      });
      clearInline(); load();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  async function doCloseToday() {
    setErr(null); setBusyKey('day');
    try {
      await apiFetch('/api/v1/daily-closings', {
        method: 'POST', body: JSON.stringify({ businessDate: todayISO() }),
      });
      clearInline(); load();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  const advanced = [
    { href: '/ops/shifts',          label: t('ops.cash.op.shifts') },
    { href: '/ops/collections',     label: t('ops.cash.op.collections') },
    { href: '/ops/handovers',       label: t('ops.cash.op.handovers') },
    { href: '/ops/reconciliations', label: t('ops.cash.op.reconciliations') },
    { href: '/ops/daily-closing',   label: t('ops.cash.op.dailyClosing') },
  ];

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.cashFlow.title')}
        subtitle={t('ops.cashFlow.subtitle')}
      />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {flash}
        </div>
      )}

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
        <>
          <section className='grid grid-cols-2 md:grid-cols-5 gap-3'>
            <Stat label={t('ops.cashFlow.summary.shifts')} value={String(shifts.length)} />
            <Stat label={t('ops.cashFlow.summary.open')} value={String(summary.open)} />
            <Stat label={t('ops.cashFlow.summary.awaitingReview')} value={String(summary.awaitingReview)} />
            <Stat label={t('ops.cashFlow.summary.awaitingConfirm')} value={String(summary.awaitingConfirm)} />
            <Stat label={t('ops.cashFlow.summary.readyToClose')} value={String(summary.readyToClose)} />
          </section>

          {rows.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500'>
              {t('ops.cashFlow.empty')}
            </div>
          ) : (
            <div className='space-y-3'>
              {rows.map((r) => {
                const isBusyRow =
                  busyKey === 'ho:' + (r.handover?.id ?? '') ||
                  busyKey === 'rv:' + (r.recon?.id ?? '') ||
                  busyKey === 'sb:' + (r.recon?.id ?? '') ||
                  busyKey === 'cs:' + r.shift.id;
                const isOpenShift = r.shift.status === 'OPEN';
                return (
                  <div key={r.shift.id} className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
                    <div className='flex items-center gap-4'>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-3 flex-wrap'>
                          <span className='font-medium text-slate-900'>{r.name}</span>
                          <span className={'text-xs px-2 py-0.5 rounded-full ' + statePillClass(r.state)}>
                            {t(stateKey(r.state))}
                          </span>
                        </div>
                        <div className='mt-1 text-sm text-slate-600'>
                          {t('ops.cashFlow.row.collected')}: <span className='font-mono'>{r.total}</span>
                        </div>
                        <div className='mt-0.5 text-sm text-slate-600'>
                          {t('table.expenses')}: {r.expenseTotal > 0
                            ? <span className='font-mono'>{r.expenseTotal.toFixed(2)}</span>
                            : <span className='text-slate-400'>{t('ops.cashFlow.row.noExpenses')}</span>}
                        </div>
                      </div>

                      {isManager && isOpenShift && (
                        <button
                          type='button'
                          onClick={() => openExpenseForm(r.shift)}
                          disabled={isBusyRow}
                          className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60'
                        >
                          {t('ops.cashFlow.row.addExpense')}
                        </button>
                      )}

                      {isManager && r.state === 'awaiting_review' && r.recon && (
                        <div className='flex gap-2'>
                          <button
                            type='button'
                            onClick={() => doApprove(r.recon!.id)}
                            disabled={isBusyRow}
                            className='rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                          >
                            {busyKey === 'rv:' + r.recon!.id ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.action.approve')}
                          </button>
                          <button
                            type='button'
                            onClick={() => { setSendBackReconId(r.recon!.id); setSendBackReason(''); }}
                            disabled={isBusyRow}
                            className='rounded-lg border border-amber-300 text-amber-800 px-3 py-1.5 text-sm disabled:opacity-60'
                          >
                            {t('ops.cashFlow.row.action.sendBack')}
                          </button>
                        </div>
                      )}

                      {isManager && r.state === 'awaiting_confirm' && r.handover && (
                        <button
                          type='button'
                          onClick={() => { setConfirmHandoverId(r.handover!.id); setConfirmHandoverNotes(''); }}
                          disabled={isBusyRow}
                          className='rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                        >
                          {t('ops.cashFlow.row.action.confirm')}
                        </button>
                      )}

                      {isManager && (r.state === 'ready_to_close' || r.state === 'awaiting_close_mid') && (
                        <button
                          type='button'
                          onClick={() => setCloseShiftId(r.shift.id)}
                          disabled={isBusyRow}
                          className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                        >
                          {busyKey === 'cs:' + r.shift.id ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.action.close')}
                        </button>
                      )}
                    </div>

                    {expenseShiftId === r.shift.id && (
                      <form onSubmit={(e) => submitExpense(e, r.shift)} className='border-t border-slate-100 pt-3 space-y-3'>
                        <h3 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.row.expenseFormHeading')}</h3>
                        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                          <SelectField
                            label={t('form.category')}
                            value={expenseCategoryId}
                            onChange={setExpenseCategoryId}
                            required
                            options={categories.map((c) => ({ value: c.id, label: c.name }))}
                          />
                          <DecimalField
                            label={t('form.amount')}
                            value={expenseAmount}
                            onChange={setExpenseAmount}
                            placeholder='0.00'
                            required
                          />
                          <SelectField
                            label={t('form.paymentMethod')}
                            value={expenseMethod}
                            onChange={setExpenseMethod}
                            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
                          />
                          <TextField
                            label={t('form.description')}
                            value={expenseDescription}
                            onChange={setExpenseDescription}
                            required
                          />
                          <SelectField
                            label={t('form.paidBy')}
                            value={expensePaidByUserId}
                            onChange={setExpensePaidByUserId}
                            options={[{ value: '', label: t('common.notSpecified') }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]}
                          />
                        </div>
                        <div className='flex gap-2 justify-end'>
                          <button
                            type='button'
                            onClick={() => { setExpenseShiftId(null); }}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
                          >
                            {t('action.cancel')}
                          </button>
                          <button
                            type='submit'
                            disabled={expenseBusy}
                            className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                          >
                            {expenseBusy ? t('ops.cashFlow.row.expenseSubmitting') : t('ops.cashFlow.row.expenseSubmit')}
                          </button>
                        </div>
                      </form>
                    )}

                    {sendBackReconId === r.recon?.id && (
                      <div className='border-t border-slate-100 pt-3 space-y-2'>
                        <input
                          className='w-full rounded border border-slate-300 px-3 py-2 text-sm'
                          placeholder={t('ops.cashFlow.row.sendBackPlaceholder')}
                          value={sendBackReason}
                          onChange={(e) => setSendBackReason(e.target.value)}
                        />
                        <div className='flex gap-2 justify-end'>
                          <button type='button' onClick={() => doSendBack(r.recon!.id)} disabled={sendBackReason.trim().length < 3 || busyKey === 'sb:' + r.recon!.id}
                            className='rounded-lg bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                            {busyKey === 'sb:' + r.recon!.id ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.action.sendBack')}
                          </button>
                          <button type='button' onClick={() => { setSendBackReconId(null); setSendBackReason(''); }}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'>
                            {t('action.cancel')}
                          </button>
                        </div>
                      </div>
                    )}

                    {confirmHandoverId === r.handover?.id && (
                      <div className='border-t border-slate-100 pt-3 space-y-2'>
                        <input
                          className='w-full rounded border border-slate-300 px-3 py-2 text-sm'
                          placeholder={t('ops.handovers.confirmNotesPlaceholder')}
                          value={confirmHandoverNotes}
                          onChange={(e) => setConfirmHandoverNotes(e.target.value)}
                        />
                        <div className='flex gap-2 justify-end'>
                          <button type='button' onClick={() => doConfirmHandover(r.handover!.id)} disabled={busyKey === 'ho:' + r.handover!.id}
                            className='rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                            {busyKey === 'ho:' + r.handover!.id ? t('ops.shiftsDetail.working') : t('action.confirm')}
                          </button>
                          <button type='button' onClick={() => { setConfirmHandoverId(null); setConfirmHandoverNotes(''); }}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'>
                            {t('action.cancel')}
                          </button>
                        </div>
                      </div>
                    )}

                    {closeShiftId === r.shift.id && (
                      <div className='border-t border-slate-100 pt-3 space-y-2'>
                        <div className='text-sm text-slate-700'>{t('ops.cashFlow.row.closeConfirmPrompt')}</div>
                        <div className='flex gap-2 justify-end'>
                          <button type='button' onClick={() => doCloseShift(r.shift.id, r.shift.status)} disabled={busyKey === 'cs:' + r.shift.id}
                            className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                            {busyKey === 'cs:' + r.shift.id ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.action.close')}
                          </button>
                          <button type='button' onClick={() => setCloseShiftId(null)}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'>
                            {t('action.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
            <h2 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.closeToday.heading')}</h2>
            {todayClosing ? (
              <div className='text-sm text-emerald-800'>{t('ops.cashFlow.closeToday.alreadyClosed')}</div>
            ) : allClosed ? (
              <>
                <div className='text-sm text-slate-600'>{t('ops.cashFlow.closeToday.ready')}</div>
                {closeDayConfirming ? (
                  <div className='flex gap-2'>
                    <button type='button' onClick={doCloseToday} disabled={busyKey === 'day'}
                      className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
                      {busyKey === 'day' ? t('ops.cashFlow.closeToday.working') : t('ops.cashFlow.closeToday.button')}
                    </button>
                    <button type='button' onClick={() => setCloseDayConfirming(false)}
                      className='rounded-lg border border-slate-300 px-4 py-2 text-sm'>
                      {t('action.cancel')}
                    </button>
                  </div>
                ) : (
                  <button type='button' onClick={() => setCloseDayConfirming(true)}
                    className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium'>
                    {t('ops.cashFlow.closeToday.button')}
                  </button>
                )}
              </>
            ) : (
              <div className='text-sm text-slate-500'>{t('ops.cashFlow.closeToday.notReady')}</div>
            )}
          </section>

          <section className='space-y-3'>
            <button
              type='button'
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className='text-xs font-medium text-slate-500 uppercase tracking-wide hover:text-slate-700'
            >
              {advancedOpen ? t('ops.cashFlow.advanced.hide') : t('ops.cashFlow.advanced.show')}
            </button>
            {advancedOpen && (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                {advanced.map((o) => (
                  <Link key={o.href} href={o.href}
                    className='rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm'>
                    <div className='text-sm font-medium text-slate-900'>{o.label}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </OpsShell>
  );
}
