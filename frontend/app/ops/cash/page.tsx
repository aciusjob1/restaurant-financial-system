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

// ============================================================ Types

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
  paymentMethod: string;
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
type Closing = { id: string; businessDate: string; status: string };

type DraftExpense = {
  id: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  paidByUserId: string;
};

type InlineForm =
  | { kind: 'add-collection'; shiftId: string }
  | { kind: 'submit-shift'; shiftId: string }
  | null;

type SubDialog =
  | { kind: 'send-back'; reconId: string }
  | null;

type Row = {
  shift: Shift;
  total: string;
  cashTotal: string;
  mobileTotal: string;
  collectionCount: number;
  expenseTotal: number;
  state: FlowState;
  name: string;
  recon: Reconciliation | undefined;
  handover: Handover | undefined;
};

// ============================================================ Constants & helpers

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

const MOBILE_METHODS = new Set(['MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA']);

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

// ============================================================ Presentational

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4'>
      <div className='text-xs uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='mt-1 text-2xl font-mono text-slate-900'>{value}</div>
    </div>
  );
}

function MethodLabel({ m }: { m: string }) {
  return <span>{m.replace(/_/g, ' ')}</span>;
}

// ============================================================ Add collection inline

function AddCollectionInline({
  shift,
  onDone,
  onCancel,
}: {
  shift: Shift;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { t, tError } = useT();
  const [method, setMethod] = useState<string>('CASH');
  const [amount, setAmount] = useState('');
  const [mobileRef, setMobileRef] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!amount.trim()) {
      setErr({ code: 'AMOUNT_REQUIRED', message: 'Amount is required.' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          shiftId: shift.id,
          paymentMethod: method,
          amount: amount.trim(),
          mobileReference: mobileRef.trim() === '' ? null : mobileRef.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
          onBehalfOfUserId: shift.userId,
        }),
      });
      onDone(t('ops.cashFlow.flash.collectionRecorded'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className='border-t border-slate-100 pt-3 space-y-3'>
      <h3 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.row.collectionFormHeading')}</h3>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
        <SelectField
          label={t('form.paymentMethod')}
          value={method}
          onChange={setMethod}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
        />
        <DecimalField label={t('form.amount')} value={amount} onChange={setAmount} placeholder='0.00' required />
        <TextField label={t('ops.collections.mobileReferenceOptional')} value={mobileRef} onChange={setMobileRef} />
      </div>
      <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />
      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      <div className='flex gap-2 justify-end'>
        <button type='button' onClick={onCancel} disabled={busy} className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>
          {t('action.cancel')}
        </button>
        <button type='submit' disabled={busy} className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
          {busy ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.collectionSubmit')}
        </button>
      </div>
    </form>
  );
}

// ============================================================ Submit shift inline

function SubmitShiftInline({
  row,
  collections,
  categories,
  users,
  onDone,
  onCancel,
}: {
  row: Row;
  collections: Collection[];
  categories: ExpenseCategory[];
  users: User[];
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { t, tError } = useT();
  const [cash, setCash] = useState('');
  const [mpesa, setMpesa] = useState('');
  const [airtel, setAirtel] = useState('');
  const [tigo, setTigo] = useState('');
  const [halo, setHalo] = useState('');
  const [bank, setBank] = useState('');
  const [card, setCard] = useState('');
  const [other, setOther] = useState('');
  const [expenses, setExpenses] = useState<DraftExpense[]>([]);
  const [cashHandedOver, setCashHandedOver] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const existing = collections.filter((c) => c.shiftId === row.shift.id && !c.voidedAt);
  const byMethod: Record<string, number> = {};
  for (const c of existing) {
    byMethod[c.paymentMethod] = (byMethod[c.paymentMethod] ?? 0) + (parseFloat(c.amount) || 0);
  }
  const existingTotal = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const existingCash = byMethod['CASH'] ?? 0;
  const existingMobile = Array.from(MOBILE_METHODS).reduce((a, m) => a + (byMethod[m] ?? 0), 0);

  const opening = parseFloat(row.shift.openingCash ?? '0') || 0;
  const cashIn = existingCash + (parseFloat(cash) || 0);
  const mobileIn = existingMobile + (parseFloat(mpesa) || 0) + (parseFloat(airtel) || 0) + (parseFloat(tigo) || 0) + (parseFloat(halo) || 0);
  const cashOut = expenses.reduce((a, e) => e.paymentMethod === 'CASH' ? a + (parseFloat(e.amount) || 0) : a, 0);
  const expected = opening + cashIn - cashOut;
  const actual = parseFloat(cashHandedOver) || 0;
  const diff = actual - expected;

  function addExpense() {
    setExpenses((prev) => [...prev, {
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 8),
      categoryId: categories.length > 0 ? categories[0].id : '',
      amount: '',
      paymentMethod: 'CASH',
      description: '',
      paidByUserId: row.shift.userId ?? '',
    }]);
  }

  function updateExpense(id: string, patch: Partial<DraftExpense>) {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const collPayload: Record<string, string> = {};
      if (cash.trim()) collPayload.cash = cash.trim();
      if (mpesa.trim()) collPayload.mpesa = mpesa.trim();
      if (airtel.trim()) collPayload.airtelMoney = airtel.trim();
      if (tigo.trim()) collPayload.tigoPesa = tigo.trim();
      if (halo.trim()) collPayload.halopesa = halo.trim();
      if (bank.trim()) collPayload.bank = bank.trim();
      if (card.trim()) collPayload.card = card.trim();
      if (other.trim()) collPayload.other = other.trim();
      const expensesPayload = expenses
        .filter((r) => r.categoryId && r.amount.trim() && r.description.trim())
        .map((r) => ({
          categoryId: r.categoryId,
          amount: r.amount.trim(),
          paymentMethod: r.paymentMethod,
          description: r.description.trim(),
          paidByUserId: r.paidByUserId || null,
        }));
      await apiFetch('/api/v1/shifts/' + row.shift.id + '/submit', {
        method: 'POST',
        body: JSON.stringify({
          collections: collPayload,
          expenses: expensesPayload,
          cashHandedOver: cashHandedOver.trim() || '0.00',
          notes: notes.trim() || null,
        }),
      });
      onDone(t('ops.cashFlow.flash.shiftClosed'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className='border-t border-slate-100 pt-3 space-y-4'>
      <h3 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.submitForm.heading')}</h3>

      <div className='rounded-xl bg-blue-50 border border-blue-100 p-3'>
        <div className='text-xs uppercase tracking-wide text-blue-900 mb-2'>{t('ops.cashFlow.submitForm.shiftHeading')}</div>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-3 text-sm'>
          <div>
            <span className='block text-xs text-slate-500'>{t('form.businessDate')}</span>
            <span className='font-mono text-slate-800'>{row.shift.businessDate}</span>
          </div>
          <div>
            <span className='block text-xs text-slate-500'>{t('table.waiter')}</span>
            <span className='text-slate-800'>{row.name}</span>
          </div>
          <div>
            <span className='block text-xs text-slate-500'>{t('ops.cashFlow.submitForm.opening')}</span>
            <span className='font-mono text-slate-800'>{row.shift.openingCash ?? '0.00'}</span>
          </div>
        </div>
      </div>

      <div className='rounded-xl bg-slate-50 border border-slate-200 p-3'>
        <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.submitForm.existingHeading')}</div>
        {existing.length === 0 ? (
          <div className='text-sm text-slate-400'>{t('ops.cashFlow.submitForm.existingNone')}</div>
        ) : (
          <div className='space-y-1'>
            {Object.entries(byMethod).map(([m, v]) => (
              <div key={m} className='flex justify-between text-sm'>
                <MethodLabel m={m} />
                <span className='font-mono'>{v.toFixed(2)}</span>
              </div>
            ))}
            <div className='flex justify-between text-sm font-medium border-t border-slate-200 pt-1'>
              <span>{t('ops.cashFlow.submitForm.existingTotal')}</span>
              <span className='font-mono'>{existingTotal.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.submitForm.additionalHeading')}</div>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
          <DecimalField label='Cash' value={cash} onChange={setCash} placeholder='0.00' />
          <DecimalField label='MPesa' value={mpesa} onChange={setMpesa} placeholder='0.00' />
          <DecimalField label='Airtel Money' value={airtel} onChange={setAirtel} placeholder='0.00' />
          <DecimalField label='Tigo Pesa' value={tigo} onChange={setTigo} placeholder='0.00' />
          <DecimalField label='HaloPesa' value={halo} onChange={setHalo} placeholder='0.00' />
          <DecimalField label='Bank' value={bank} onChange={setBank} placeholder='0.00' />
          <DecimalField label='Card' value={card} onChange={setCard} placeholder='0.00' />
          <DecimalField label='Other' value={other} onChange={setOther} placeholder='0.00' />
        </div>
      </div>

      <div>
        <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.submitForm.expensesHeading')}</div>
        {expenses.length === 0 && (
          <div className='text-sm text-slate-400'>{t('ops.cashFlow.submitForm.noExpenses')}</div>
        )}
        {expenses.map((row2) => (
          <div key={row2.id} className='grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-3'>
            <div className='md:col-span-3'>
              <SelectField
                label={t('form.category')}
                value={row2.categoryId}
                onChange={(v) => updateExpense(row2.id, { categoryId: v })}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div className='md:col-span-2'>
              <DecimalField label={t('form.amount')} value={row2.amount} onChange={(v) => updateExpense(row2.id, { amount: v })} placeholder='0.00' />
            </div>
            <div className='md:col-span-2'>
              <SelectField
                label={t('form.paymentMethod')}
                value={row2.paymentMethod}
                onChange={(v) => updateExpense(row2.id, { paymentMethod: v })}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
              />
            </div>
            <div className='md:col-span-3'>
              <TextField label={t('form.description')} value={row2.description} onChange={(v) => updateExpense(row2.id, { description: v })} />
            </div>
            <div className='md:col-span-2'>
              <SelectField
                label={t('form.paidBy')}
                value={row2.paidByUserId}
                onChange={(v) => updateExpense(row2.id, { paidByUserId: v })}
                options={[{ value: '', label: t('common.notSpecified') }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]}
              />
            </div>
            <div className='md:col-span-12 flex justify-end'>
              <button type='button' onClick={() => removeExpense(row2.id)} className='text-xs text-red-600 hover:text-red-700'>
                {t('ops.cashFlow.submitForm.removeExpense')}
              </button>
            </div>
          </div>
        ))}
        <button type='button' onClick={addExpense} className='text-sm text-slate-600 hover:text-slate-900'>
          {t('ops.cashFlow.submitForm.addExpense')}
        </button>
      </div>

      <div>
        <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>{t('ops.cashFlow.submitForm.handoverHeading')}</div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <DecimalField label={t('ops.cashFlow.submitForm.cashHandedOver')} value={cashHandedOver} onChange={setCashHandedOver} placeholder='0.00' />
        </div>
      </div>

      <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />

      <div className='rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1'>
        <div className='text-xs uppercase tracking-wide text-slate-500 mb-1'>{t('ops.cashFlow.submitForm.summaryHeading')}</div>
        <div className='flex justify-between'><span>{t('ops.cashFlow.submitForm.opening')}</span><span className='font-mono'>{opening.toFixed(2)}</span></div>
        <div className='flex justify-between'><span>{t('ops.cashFlow.submitForm.cashCollected')}</span><span className='font-mono'>{cashIn.toFixed(2)}</span></div>
        <div className='flex justify-between'><span>{t('ops.cashFlow.submitForm.cashExpenses')}</span><span className='font-mono'>-{cashOut.toFixed(2)}</span></div>
        <div className='flex justify-between font-medium border-t border-slate-200 pt-1'><span>{t('ops.cashFlow.submitForm.expected')}</span><span className='font-mono'>{expected.toFixed(2)}</span></div>
        <div className='flex justify-between'><span>{t('ops.cashFlow.submitForm.cashHandedOver')}</span><span className='font-mono'>{actual.toFixed(2)}</span></div>
        <div className={'flex justify-between font-medium ' + (diff === 0 ? 'text-emerald-700' : 'text-amber-700')}><span>{t('ops.cashFlow.submitForm.difference')}</span><span className='font-mono'>{diff.toFixed(2)}</span></div>
        <div className='flex justify-between text-slate-600 pt-1'><span>{t('ops.cashFlow.submitForm.mobile')}</span><span className='font-mono'>{mobileIn.toFixed(2)}</span></div>
      </div>

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

      <div className='flex gap-2 justify-end'>
        <button type='button' onClick={onCancel} disabled={busy} className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>
          {t('action.cancel')}
        </button>
        <button type='submit' disabled={busy} className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
          {busy ? t('ops.cashFlow.submitForm.submitting') : t('ops.cashFlow.submitForm.submit')}
        </button>
      </div>
    </form>
  );
}

// ============================================================ Small inline sub-dialogs

function SendBackInline({
  onConfirm,
  onCancel,
  busy,
}: { onConfirm: (reason: string) => void; onCancel: () => void; busy: boolean }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <div className='border-t border-slate-100 pt-3 space-y-2'>
      <input
        className='w-full rounded border border-slate-300 px-3 py-2 text-sm'
        placeholder={t('ops.cashFlow.row.sendBackPlaceholder')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className='flex gap-2 justify-end'>
        <button type='button' onClick={() => onConfirm(reason)} disabled={reason.trim().length < 3 || busy}
          className='rounded-lg bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
          {busy ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.action.sendBack')}
        </button>
        <button type='button' onClick={onCancel} disabled={busy} className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>
          {t('action.cancel')}
        </button>
      </div>
    </div>
  );
}





// ============================================================ Open shift dialog

function OpenShiftDialog({
  waiters,
  onClose,
  onDone,
}: {
  waiters: User[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { t, tError } = useT();
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');
  const [waiterId, setWaiterId] = useState(waiters.length > 0 ? waiters[0].id : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!waiterId) {
      setErr({ code: 'WAITER_REQUIRED', message: 'Select a waiter.' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/v1/shifts', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          openingCash: openingCash.trim() || undefined,
          notes: notes.trim() === '' ? null : notes.trim(),
          onBehalfOfUserId: waiterId,
        }),
      });
      onDone(t('ops.cashFlow.flash.shiftOpened'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <div className='w-full max-w-lg rounded-2xl bg-white p-6 space-y-4'>
        <h3 className='text-lg font-medium text-slate-900'>{t('ops.cashFlow.startDialog.title')}</h3>
        {waiters.length === 0 ? (
          <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'>
            {t('ops.cashFlow.startDialog.noWaiters')}
          </div>
        ) : (
          <form onSubmit={submit} className='space-y-4'>
            <SelectField
              label={t('ops.cashFlow.startDialog.waiter')}
              value={waiterId}
              onChange={setWaiterId}
              required
              options={waiters.map((u) => ({ value: u.id, label: u.fullName }))}
            />
            <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
            <DecimalField label={t('ops.shifts.openingCashOptional')} value={openingCash} onChange={setOpeningCash} placeholder='0.00' />
            <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />
            {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
            <div className='flex justify-end gap-2'>
              <button type='button' onClick={onClose} disabled={busy} className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>
                {t('action.cancel')}
              </button>
              <button type='submit' disabled={busy} className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                {busy ? t('ops.cashFlow.startDialog.submitting') : t('action.startShift')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================ Main page

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
  const [, setMyId] = useState('');
  const [myRole, setMyRole] = useState('');
  const [todayClosing, setTodayClosing] = useState<Closing | null>(null);

  const [inlineForm, setInlineForm] = useState<InlineForm>(null);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [closeDayConfirming, setCloseDayConfirming] = useState(false);

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
      const cashTotal = coll.filter((c) => c.paymentMethod === 'CASH').reduce((acc, c) => acc + parseFloat(c.amount), 0);
      const mobileTotal = coll.filter((c) => MOBILE_METHODS.has(c.paymentMethod)).reduce((acc, c) => acc + parseFloat(c.amount), 0);
      const rowExpenses = expenses.filter((e) => e.shiftId === s.id);
      const expenseTotal = rowExpenses.reduce((acc, e) => acc + parseFloat(e.amount), 0);
      const recon = recons.find((r) => r.shiftId === s.id);
      const handover = recon ? handovers.find((h) => h.reconciliationId === recon.id) : undefined;
      const state = deriveState(s, recon, handover);
      const name = users.find((u) => u.id === s.userId)?.fullName ?? (s.userId ? s.userId.slice(0, 8) : '\\u2014');
      return {
        shift: s,
        total: total.toFixed(2),
        cashTotal: cashTotal.toFixed(2),
        mobileTotal: mobileTotal.toFixed(2),
        collectionCount: coll.length,
        expenseTotal,
        state,
        name,
        recon,
        handover,
      };
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
  const allClosed = rows.length > 0 && rows.every((r) => r.state === 'closed');
  const WAITERS = users.filter((u) => u.role === 'WAITER');

  function clearAndReload(msg?: string) {
    if (msg) setFlash(msg);
    setInlineForm(null);
    setSubDialog(null);
    load();
  }


  async function doSendBack(reconId: string, reason: string) {
    setErr(null); setBusyKey('sb:' + reconId);
    try {
      await apiFetch('/api/v1/reconciliations/' + reconId + '/review', {
        method: 'POST', body: JSON.stringify({ decision: 'SEND_BACK', reviewNotes: reason.trim() }),
      });
      clearAndReload();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  async function doFinalize(shiftId: string) {
    setErr(null); setBusyKey('fin:' + shiftId);
    try {
      await apiFetch('/api/v1/shifts/' + shiftId + '/finalize', {
        method: 'POST', body: JSON.stringify({}),
      });
      clearAndReload(t('ops.cashFlow.flash.shiftFinalized'));
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }



  async function doCloseToday() {
    setErr(null); setBusyKey('day');
    try {
      await apiFetch('/api/v1/daily-closings', {
        method: 'POST', body: JSON.stringify({ businessDate: todayISO() }),
      });
      clearAndReload();
    } catch (e) { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); }
    finally { setBusyKey(null); }
  }

  return (
    <OpsShell>
      <OpsHeader title={t('ops.cashFlow.title')} subtitle={t('ops.cashFlow.subtitle')} />

      <div className='flex justify-end'>
        <button type='button' onClick={() => setStartOpen(true)}
          className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium'>
          {t('ops.cashFlow.startShiftButton')}
        </button>
      </div>

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>{flash}</div>
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
                  busyKey === 'sb:' + (r.recon?.id ?? '') ||
                  busyKey === 'fin:' + r.shift.id;
                const isOpenShift = r.shift.status === 'OPEN';
                const inline = inlineForm?.shiftId === r.shift.id ? inlineForm : null;
                const dialogForThisRow =
                  subDialog?.kind === 'send-back' && subDialog.reconId === r.recon?.id
                    ? subDialog
                    : null;

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
                          {t('ops.cashFlow.submitForm.opening')}: <span className='font-mono'>{r.shift.openingCash ?? '0.00'}</span>
                        </div>
                        <div className='mt-1 text-sm text-slate-600'>
                          {t('ops.cashFlow.row.collected')}: <span className='font-mono'>{r.total}</span>
                        </div>
                        <div className='mt-0.5 text-sm text-slate-600'>
                          {t('ops.cashFlow.row.cash')}: <span className='font-mono'>{r.cashTotal}</span>
                        </div>
                        <div className='mt-0.5 text-sm text-slate-600'>
                          {t('ops.cashFlow.row.mobile')}: <span className='font-mono'>{r.mobileTotal}</span>
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
                            {r.recon.actualCash != null && (
                              <div className='mt-0.5 text-sm text-slate-600'>
                                {t('ops.cashFlow.row.handover')}: <span className='font-mono'>{r.recon.actualCash}</span>
                              </div>
                            )}
                            {r.recon.cashDifference != null && (
                              <div className={'mt-0.5 text-sm ' + (r.recon.cashDifference === '0.00' ? 'text-emerald-700' : 'text-amber-700')}>
                                {t('ops.cashFlow.row.difference')}: <span className='font-mono'>{r.recon.cashDifference}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {isManager && isOpenShift && (
                        <div className='flex gap-2'>
                          <button type='button' onClick={() => setInlineForm({ kind: 'add-collection', shiftId: r.shift.id })}
                            disabled={isBusyRow}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60'>
                            {t('ops.cashFlow.row.addCollectionButton')}
                          </button>
                          <button type='button' onClick={() => setInlineForm({ kind: 'submit-shift', shiftId: r.shift.id })}
                            disabled={isBusyRow}
                            className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                            {t('ops.cashFlow.row.action.submit')}
                          </button>
                        </div>
                      )}

                      {isManager && (
                        r.state === 'awaiting_review' ||
                        r.state === 'awaiting_handover' ||
                        r.state === 'awaiting_confirm' ||
                        r.state === 'awaiting_close_mid' ||
                        r.state === 'ready_to_close'
                      ) && (
                        <div className='flex gap-2'>
                          <button type='button' onClick={() => doFinalize(r.shift.id)} disabled={isBusyRow}
                            className='rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                            {busyKey === 'fin:' + r.shift.id
                              ? t('ops.shiftsDetail.working')
                              : ((r.recon?.status === 'SUBMITTED' || r.handover?.status === 'PENDING')
                                  ? t('ops.cashFlow.row.action.approveAndFinalize')
                                  : t('ops.cashFlow.row.action.finalize'))}
                          </button>
                          {r.state === 'awaiting_review' && r.recon && (
                            <button type='button' onClick={() => setSubDialog({ kind: 'send-back', reconId: r.recon!.id })} disabled={isBusyRow}
                              className='rounded-lg border border-amber-300 text-amber-800 px-3 py-1.5 text-sm disabled:opacity-60'>
                              {t('ops.cashFlow.row.action.sendBack')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {inline?.kind === 'add-collection' && (
                      <AddCollectionInline
                        shift={r.shift}
                        onCancel={() => setInlineForm(null)}
                        onDone={(msg) => clearAndReload(msg)}
                      />
                    )}

                    {inline?.kind === 'submit-shift' && (
                      <SubmitShiftInline
                        row={r}
                        collections={collections}
                        categories={categories}
                        users={users}
                        onCancel={() => setInlineForm(null)}
                        onDone={(msg) => clearAndReload(msg)}
                      />
                    )}

                    {dialogForThisRow?.kind === 'send-back' && (
                      <SendBackInline
                        busy={busyKey === 'sb:' + dialogForThisRow.reconId}
                        onCancel={() => setSubDialog(null)}
                        onConfirm={(reason) => doSendBack(dialogForThisRow.reconId, reason)}
                      />
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
        <OpenShiftDialog
          waiters={WAITERS}
          onClose={() => setStartOpen(false)}
          onDone={(msg) => { setStartOpen(false); clearAndReload(msg); }}
        />
      )}
    </OpsShell>
  );
}
