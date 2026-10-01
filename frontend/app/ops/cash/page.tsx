'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DecimalField, SelectField, TextField, TextArea, DateField, FormError,
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
  expectedCash?: string | null;
  actualCash?: string | null;
  cashDifference?: string | null;
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

type CloseExpense = {
  id: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  paidByUserId: string;
};
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
  if (shift.status === 'OPEN' && !recon) return 'open';
  if (!recon) return 'awaiting_recon';
  if (recon.status === 'DRAFT') return 'awaiting_recon';
  if (recon.status === 'SUBMITTED') return 'awaiting_review';
  if (!handover) return 'awaiting_handover';
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
  const [startOpen, setStartOpen] = useState(false);
  const [startBusinessDate, setStartBusinessDate] = useState(todayISO());
  const [startOpeningCash, setStartOpeningCash] = useState('');
  const [startNotes, setStartNotes] = useState('');
  const [startWaiterId, setStartWaiterId] = useState('');
  const [startBusy, setStartBusy] = useState(false);
  const [startErr, setStartErr] = useState<{ code: string; message: string } | null>(null);

  // inline collection form state
  const [collShiftId, setCollShiftId] = useState<string | null>(null);
  const [collMethod, setCollMethod] = useState<string>('CASH');
  const [collAmount, setCollAmount] = useState('');
  const [collMobileRef, setCollMobileRef] = useState('');
  const [collNotes, setCollNotes] = useState('');
  const [collBusy, setCollBusy] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmHandoverId, setConfirmHandoverId] = useState<string | null>(null);
  const [confirmHandoverNotes, setConfirmHandoverNotes] = useState('');
  const [sendBackReconId, setSendBackReconId] = useState<string | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [closeShiftId, setCloseShiftId] = useState<string | null>(null);
  const [closeDayConfirming, setCloseDayConfirming] = useState(false);

  // close-shift form state
  const [closeFormShiftId, setCloseFormShiftId] = useState<string | null>(null);
  const [closeCash, setCloseCash] = useState('');
  const [closeMpesa, setCloseMpesa] = useState('');
  const [closeAirtel, setCloseAirtel] = useState('');
  const [closeTigo, setCloseTigo] = useState('');
  const [closeHalo, setCloseHalo] = useState('');
  const [closeBank, setCloseBank] = useState('');
  const [closeCard, setCloseCard] = useState('');
  const [closeOther, setCloseOther] = useState('');
  const [closeExpenses, setCloseExpenses] = useState<CloseExpense[]>([]);
  const [closeCashHandedOver, setCloseCashHandedOver] = useState('');
  const [closeReceivedByUserId, setCloseReceivedByUserId] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);

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

  function openCollectionForm(shift: Shift) {
    setErr(null); setFlash(null);
    setCollShiftId(shift.id);
    setCollMethod('CASH');
    setCollAmount('');
    setCollMobileRef('');
    setCollNotes('');
  }

  async function submitCollection(e: FormEvent, shift: Shift) {
    e.preventDefault();
    setErr(null); setFlash(null);
    if (!collAmount.trim()) {
      setErr({ code: 'AMOUNT_REQUIRED', message: 'Amount is required.' });
      return;
    }
    setCollBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          shiftId: shift.id,
          paymentMethod: collMethod,
          amount: collAmount.trim(),
          mobileReference: collMobileRef.trim() === '' ? null : collMobileRef.trim(),
          notes: collNotes.trim() === '' ? null : collNotes.trim(),
          onBehalfOfUserId: shift.userId,
        }),
      });
      setFlash(t('ops.cashFlow.flash.collectionRecorded'));
      setCollShiftId(null);
      load();
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setCollBusy(false);
    }
  }

  function clearInline() {
    setConfirmHandoverId(null); setConfirmHandoverNotes('');
    setSendBackReconId(null); setSendBackReason('');
    setCloseShiftId(null); setCloseDayConfirming(false);
    setCollShiftId(null);
    setCloseFormShiftId(null);
    setCloseCash(''); setCloseMpesa(''); setCloseAirtel(''); setCloseTigo('');
    setCloseHalo(''); setCloseBank(''); setCloseCard(''); setCloseOther('');
    setCloseExpenses([]);
    setCloseCashHandedOver(''); setCloseReceivedByUserId(''); setCloseNotes('');
  }

  function openCloseForm(shift: Shift) {
    setErr(null); setFlash(null);
    setCloseFormShiftId(shift.id);
    setCloseCash(''); setCloseMpesa(''); setCloseAirtel(''); setCloseTigo('');
    setCloseHalo(''); setCloseBank(''); setCloseCard(''); setCloseOther('');
    setCloseExpenses([]);
    setCloseCashHandedOver('');
    setCloseReceivedByUserId(myId);
    setCloseNotes('');
  }

  function addCloseExpense(ownerId: string) {
    setCloseExpenses((prev) => [
      ...prev,
      {
        id: 'e' + Date.now() + Math.random().toString(36).slice(2, 8),
        categoryId: categories.length > 0 ? categories[0].id : '',
        amount: '',
        paymentMethod: 'CASH',
        description: '',
        paidByUserId: ownerId,
      },
    ]);
  }

  function updateCloseExpense(id: string, patch: Partial<CloseExpense>) {
    setCloseExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeCloseExpense(id: string) {
    setCloseExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function submitCloseForm(e: FormEvent, shift: Shift) {
    e.preventDefault();
    setErr(null); setFlash(null);
    if (!closeReceivedByUserId) {
      setErr({ code: 'RECEIVER_REQUIRED', message: 'Select who received the cash.' });
      return;
    }
    setCloseBusy(true);
    try {
      const collections: Record<string, string> = {};
      if (closeCash.trim()) collections.cash = closeCash.trim();
      if (closeMpesa.trim()) collections.mpesa = closeMpesa.trim();
      if (closeAirtel.trim()) collections.airtelMoney = closeAirtel.trim();
      if (closeTigo.trim()) collections.tigoPesa = closeTigo.trim();
      if (closeHalo.trim()) collections.halopesa = closeHalo.trim();
      if (closeBank.trim()) collections.bank = closeBank.trim();
      if (closeCard.trim()) collections.card = closeCard.trim();
      if (closeOther.trim()) collections.other = closeOther.trim();
      const expensesPayload = closeExpenses
        .filter((row) => row.categoryId && row.amount.trim() && row.description.trim())
        .map((row) => ({
          categoryId: row.categoryId,
          amount: row.amount.trim(),
          paymentMethod: row.paymentMethod,
          description: row.description.trim(),
          paidByUserId: row.paidByUserId || null,
        }));
      await apiFetch('/api/v1/shifts/' + shift.id + '/close-money', {
        method: 'POST',
        body: JSON.stringify({
          collections,
          expenses: expensesPayload,
          cashHandedOver: closeCashHandedOver.trim() || '0.00',
          receivedByUserId: closeReceivedByUserId,
          notes: closeNotes.trim() || null,
        }),
      });
      setFlash(t('ops.cashFlow.flash.shiftClosed'));
      clearInline();
      load();
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setCloseBusy(false);
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

  const WAITERS = users.filter((u) => u.role === 'WAITER');

  function openStartDialog() {
    setStartBusinessDate(todayISO());
    setStartOpeningCash('');
    setStartNotes('');
    setStartWaiterId(WAITERS.length > 0 ? WAITERS[0].id : '');
    setStartErr(null);
    setStartOpen(true);
  }

  async function submitStartShift(e: FormEvent) {
    e.preventDefault();
    setStartErr(null);
    if (!startWaiterId) {
      setStartErr({ code: 'WAITER_REQUIRED', message: 'Select a waiter.' });
      return;
    }
    setStartBusy(true);
    try {
      await apiFetch('/api/v1/shifts', {
        method: 'POST',
        body: JSON.stringify({
          businessDate: startBusinessDate,
          openingCash: startOpeningCash.trim() || undefined,
          notes: startNotes.trim() === '' ? null : startNotes.trim(),
          onBehalfOfUserId: startWaiterId,
        }),
      });
      setStartOpen(false);
      setFlash(t('ops.cashFlow.flash.shiftOpened'));
      load();
    } catch (e2) {
      if (e2 instanceof ApiError) setStartErr({ code: e2.code, message: e2.message });
    } finally {
      setStartBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.cashFlow.title')}
        subtitle={t('ops.cashFlow.subtitle')}
      />

      <div className='flex justify-end'>
        <button
          type='button'
          onClick={openStartDialog}
          className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium'
        >
          {t('ops.cashFlow.startShiftButton')}
        </button>
      </div>

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
                          <span className='text-xs text-slate-500 font-mono'>{r.shift.businessDate}</span>
                        </div>
                        <div className='mt-0.5 text-xs text-slate-500'>
                          {t('ops.cashFlow.closeForm.opening')}: <span className='font-mono'>{r.shift.openingCash ?? '0.00'}</span>
                        </div>
                        <div className='mt-1 text-sm text-slate-600'>
                          {t('ops.cashFlow.row.collected')}: <span className='font-mono'>{r.total}</span>
                        </div>
                        <div className='mt-0.5 text-sm text-slate-600'>
                          {t('table.expenses')}: {r.expenseTotal > 0
                            ? <span className='font-mono'>{r.expenseTotal.toFixed(2)}</span>
                            : <span className='text-slate-400'>{t('ops.cashFlow.row.noExpenses')}</span>}
                        </div>
                        {r.recon?.expectedCash && (
                          <>
                            <div className='mt-0.5 text-sm text-slate-600'>
                              {t('ops.cashFlow.row.expected')}: <span className='font-mono'>{r.recon.expectedCash}</span>
                            </div>
                            {r.recon.actualCash !== null && r.recon.actualCash !== undefined && (
                              <div className='mt-0.5 text-sm text-slate-600'>
                                {t('ops.cashFlow.row.handover')}: <span className='font-mono'>{r.recon.actualCash}</span>
                              </div>
                            )}
                            {r.recon.cashDifference !== null && r.recon.cashDifference !== undefined && (
                              <div className={'mt-0.5 text-sm ' + (r.recon.cashDifference === '0.00' ? 'text-emerald-700' : 'text-amber-700')}>
                                {t('ops.cashFlow.row.difference')}: <span className='font-mono'>{r.recon.cashDifference}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {isManager && isOpenShift && (
                        <div className='flex gap-2'>
                          <button
                            type='button'
                            onClick={() => openCollectionForm(r.shift)}
                            disabled={isBusyRow}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60'
                          >
                            {t('ops.cashFlow.row.addCollectionButton')}
                          </button>
                          <button
                            type='button'
                            onClick={() => openCloseForm(r.shift)}
                            disabled={isBusyRow}
                            className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                          >
                            {t('ops.cashFlow.row.action.close')}
                          </button>
                        </div>
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

                    {collShiftId === r.shift.id && (
                      <form onSubmit={(e) => submitCollection(e, r.shift)} className='border-t border-slate-100 pt-3 space-y-3'>
                        <h3 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.row.collectionFormHeading')}</h3>
                        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                          <SelectField
                            label={t('form.paymentMethod')}
                            value={collMethod}
                            onChange={setCollMethod}
                            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
                          />
                          <DecimalField
                            label={t('form.amount')}
                            value={collAmount}
                            onChange={setCollAmount}
                            placeholder='0.00'
                            required
                          />
                          <TextField
                            label={t('ops.collections.mobileReferenceOptional')}
                            value={collMobileRef}
                            onChange={setCollMobileRef}
                          />
                        </div>
                        <TextArea label={t('form.notesOptional')} value={collNotes} onChange={setCollNotes} rows={2} />
                        <div className='flex gap-2 justify-end'>
                          <button
                            type='button'
                            onClick={() => setCollShiftId(null)}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
                          >
                            {t('action.cancel')}
                          </button>
                          <button
                            type='submit'
                            disabled={collBusy}
                            className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                          >
                            {collBusy ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.collectionSubmit')}
                          </button>
                        </div>
                      </form>
                    )}

                    {closeFormShiftId === r.shift.id && (
                      <form onSubmit={(e) => submitCloseForm(e, r.shift)} className='border-t border-slate-100 pt-3 space-y-4'>
                        <h3 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.closeForm.heading')}</h3>

                        <div className='rounded-xl bg-blue-50 border border-blue-100 p-3'>
                          <div className='text-xs uppercase tracking-wide text-blue-900 mb-2'>{t('ops.cashFlow.closeForm.shiftHeading')}</div>
                          <div className='grid grid-cols-2 md:grid-cols-3 gap-3 text-sm'>
                            <div>
                              <span className='block text-xs text-slate-500'>{t('form.businessDate')}</span>
                              <span className='font-mono text-slate-800'>{r.shift.businessDate}</span>
                            </div>
                            <div>
                              <span className='block text-xs text-slate-500'>{t('table.waiter')}</span>
                              <span className='text-slate-800'>{r.name}</span>
                            </div>
                            <div>
                              <span className='block text-xs text-slate-500'>{t('ops.cashFlow.closeForm.opening')}</span>
                              <span className='font-mono text-slate-800'>{r.shift.openingCash ?? '0.00'}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.closeForm.receivedHeading')}</div>
                          <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
                            <DecimalField label='Cash' value={closeCash} onChange={setCloseCash} placeholder='0.00' />
                            <DecimalField label='MPesa' value={closeMpesa} onChange={setCloseMpesa} placeholder='0.00' />
                            <DecimalField label='Airtel Money' value={closeAirtel} onChange={setCloseAirtel} placeholder='0.00' />
                            <DecimalField label='Tigo Pesa' value={closeTigo} onChange={setCloseTigo} placeholder='0.00' />
                            <DecimalField label='HaloPesa' value={closeHalo} onChange={setCloseHalo} placeholder='0.00' />
                            <DecimalField label='Bank' value={closeBank} onChange={setCloseBank} placeholder='0.00' />
                            <DecimalField label='Card' value={closeCard} onChange={setCloseCard} placeholder='0.00' />
                            <DecimalField label='Other' value={closeOther} onChange={setCloseOther} placeholder='0.00' />
                          </div>
                        </div>

                        <div>
                          <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.closeForm.expensesHeading')}</div>
                          {closeExpenses.length === 0 && (
                            <div className='text-sm text-slate-400'>{t('ops.cashFlow.closeForm.noExpenses')}</div>
                          )}
                          {closeExpenses.map((row) => (
                            <div key={row.id} className='grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-3'>
                              <div className='md:col-span-3'>
                                <SelectField
                                  label={t('form.category')}
                                  value={row.categoryId}
                                  onChange={(v) => updateCloseExpense(row.id, { categoryId: v })}
                                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                                />
                              </div>
                              <div className='md:col-span-2'>
                                <DecimalField
                                  label={t('form.amount')}
                                  value={row.amount}
                                  onChange={(v) => updateCloseExpense(row.id, { amount: v })}
                                  placeholder='0.00'
                                />
                              </div>
                              <div className='md:col-span-2'>
                                <SelectField
                                  label={t('form.paymentMethod')}
                                  value={row.paymentMethod}
                                  onChange={(v) => updateCloseExpense(row.id, { paymentMethod: v })}
                                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
                                />
                              </div>
                              <div className='md:col-span-3'>
                                <TextField
                                  label={t('form.description')}
                                  value={row.description}
                                  onChange={(v) => updateCloseExpense(row.id, { description: v })}
                                />
                              </div>
                              <div className='md:col-span-2'>
                                <SelectField
                                  label={t('form.paidBy')}
                                  value={row.paidByUserId}
                                  onChange={(v) => updateCloseExpense(row.id, { paidByUserId: v })}
                                  options={[{ value: '', label: t('common.notSpecified') }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]}
                                />
                              </div>
                              <div className='md:col-span-12 flex justify-end'>
                                <button
                                  type='button'
                                  onClick={() => removeCloseExpense(row.id)}
                                  className='text-xs text-red-600 hover:text-red-700'
                                >
                                  {t('ops.cashFlow.closeForm.removeExpense')}
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            type='button'
                            onClick={() => addCloseExpense(r.shift.userId ?? '')}
                            className='text-sm text-slate-600 hover:text-slate-900'
                          >
                            {t('ops.cashFlow.closeForm.addExpense')}
                          </button>
                        </div>

                        <div>
                          <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.closeForm.handoverHeading')}</div>
                          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                            <DecimalField
                              label={t('ops.cashFlow.closeForm.cashHandedOver')}
                              value={closeCashHandedOver}
                              onChange={setCloseCashHandedOver}
                              placeholder='0.00'
                            />
                            <SelectField
                              label={t('form.receiver')}
                              value={closeReceivedByUserId}
                              onChange={setCloseReceivedByUserId}
                              options={[{ value: '', label: t('form.selectPlaceholder') }, ...users.filter((u) => u.role === 'MANAGER' || u.role === 'OWNER').map((u) => ({ value: u.id, label: u.fullName }))]}
                            />
                          </div>
                        </div>

                        <TextArea
                          label={t('form.notesOptional')}
                          value={closeNotes}
                          onChange={setCloseNotes}
                          rows={2}
                        />

                        {(() => {
                          const opening = parseFloat(r.shift.openingCash ?? '0') || 0;
                          const cashIn = parseFloat(closeCash) || 0;
                          const mobileIn = (parseFloat(closeMpesa) || 0) + (parseFloat(closeAirtel) || 0) + (parseFloat(closeTigo) || 0) + (parseFloat(closeHalo) || 0);
                          const cashOut = closeExpenses.reduce((acc, e) => e.paymentMethod === 'CASH' ? acc + (parseFloat(e.amount) || 0) : acc, 0);
                          const expected = opening + cashIn - cashOut;
                          const actual = parseFloat(closeCashHandedOver) || 0;
                          const diff = actual - expected;
                          return (
                            <div className='rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1'>
                              <div className='text-xs uppercase tracking-wide text-slate-500 mb-1'>{t('ops.cashFlow.closeForm.summaryHeading')}</div>
                              <div className='flex justify-between'><span>{t('ops.cashFlow.closeForm.opening')}</span><span className='font-mono'>{opening.toFixed(2)}</span></div>
                              <div className='flex justify-between'><span>{t('ops.cashFlow.closeForm.cashCollected')}</span><span className='font-mono'>{cashIn.toFixed(2)}</span></div>
                              <div className='flex justify-between'><span>{t('ops.cashFlow.closeForm.cashExpenses')}</span><span className='font-mono'>-{cashOut.toFixed(2)}</span></div>
                              <div className='flex justify-between font-medium border-t border-slate-200 pt-1'><span>{t('ops.cashFlow.closeForm.expected')}</span><span className='font-mono'>{expected.toFixed(2)}</span></div>
                              <div className='flex justify-between'><span>{t('ops.cashFlow.closeForm.cashHandedOver')}</span><span className='font-mono'>{actual.toFixed(2)}</span></div>
                              <div className={'flex justify-between font-medium ' + (diff === 0 ? 'text-emerald-700' : 'text-amber-700')}><span>{t('ops.cashFlow.closeForm.difference')}</span><span className='font-mono'>{diff.toFixed(2)}</span></div>
                              <div className='flex justify-between text-slate-600 pt-1'><span>{t('ops.cashFlow.closeForm.mobile')}</span><span className='font-mono'>{mobileIn.toFixed(2)}</span></div>
                            </div>
                          );
                        })()}

                        <div className='flex gap-2 justify-end'>
                          <button
                            type='button'
                            onClick={() => { setCloseFormShiftId(null); setCloseExpenses([]); }}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
                          >
                            {t('action.cancel')}
                          </button>
                          <button
                            type='submit'
                            disabled={closeBusy}
                            className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                          >
                            {closeBusy ? t('ops.cashFlow.closeForm.submitting') : t('ops.cashFlow.closeForm.submit')}
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

        </>
      )}

      {startOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-lg rounded-2xl bg-white p-6 space-y-4'>
            <h3 className='text-lg font-medium text-slate-900'>{t('ops.cashFlow.startDialog.title')}</h3>
            {WAITERS.length === 0 ? (
              <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'>
                {t('ops.cashFlow.startDialog.noWaiters')}
              </div>
            ) : (
              <form onSubmit={submitStartShift} className='space-y-4'>
                <SelectField
                  label={t('ops.cashFlow.startDialog.waiter')}
                  value={startWaiterId}
                  onChange={setStartWaiterId}
                  required
                  options={WAITERS.map((u) => ({ value: u.id, label: u.fullName }))}
                />
                <DateField
                  label={t('form.businessDate')}
                  value={startBusinessDate}
                  onChange={setStartBusinessDate}
                  required
                />
                <DecimalField
                  label={t('ops.shifts.openingCashOptional')}
                  value={startOpeningCash}
                  onChange={setStartOpeningCash}
                  placeholder='0.00'
                />
                <TextArea
                  label={t('form.notesOptional')}
                  value={startNotes}
                  onChange={setStartNotes}
                  rows={2}
                />
                {startErr && <FormError code={startErr.code} message={tError(startErr.code, startErr.message)} />}
                <div className='flex justify-end gap-2'>
                  <button
                    type='button'
                    onClick={() => setStartOpen(false)}
                    disabled={startBusy}
                    className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'
                  >
                    {t('action.cancel')}
                  </button>
                  <button
                    type='submit'
                    disabled={startBusy}
                    className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                  >
                    {startBusy ? t('ops.cashFlow.startDialog.submitting') : t('action.startShift')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </OpsShell>
  );
}
