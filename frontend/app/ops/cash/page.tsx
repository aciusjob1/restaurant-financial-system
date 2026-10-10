'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DecimalField, SelectField, TextField, TextArea, DateField, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

// ---------- types ----------

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
  shiftId: string | null;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
};

type Category = { id: string; name: string; isActive: boolean; systemKey: string | null };
type User = { id: string; fullName: string; role: string };
type Closing = { id: string; businessDate: string };
type SalesSummary = {
  id: string;
  businessDate: string;
  userId: string | null;
  totalSales: string;
};

type DraftExpense = {
  id: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  paidByUserId: string;
};

type InlineForm = { kind: 'submit-shift'; shiftId: string } | null;
type SubDialog = { kind: 'send-back'; reconId: string } | null;

type FlowState =
  | 'open' | 'awaiting_recon' | 'awaiting_review' | 'awaiting_handover'
  | 'awaiting_confirm' | 'awaiting_close_mid' | 'ready_to_close' | 'closed';

type Row = {
  shift: Shift;
  total: string;
  cashTotal: string;
  mobileTotal: string;
  expenseTotal: number;
  state: FlowState;
  name: string;
  recon: Reconciliation | undefined;
  handover: Handover | undefined;
  sales: string | null;
};

// ---------- helpers ----------

const PAYMENT_METHODS = ['CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA', 'BANK', 'CARD', 'OTHER'] as const;
const MOBILE_METHODS = new Set(['MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA']);

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function deriveState(s: Shift, recon: Reconciliation | undefined, handover: Handover | undefined): FlowState {
  if (s.status === 'CLOSED') return 'closed';
  if (s.status === 'RECONCILING') return 'ready_to_close';
  if (s.status === 'OPEN' && !recon) return 'open';
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

function pillClass(s: FlowState): string {
  if (s === 'closed') return 'bg-slate-100 text-slate-500';
  if (s === 'ready_to_close' || s === 'awaiting_close_mid') return 'bg-emerald-100 text-emerald-700';
  if (s === 'awaiting_confirm' || s === 'awaiting_review') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}

function diffClass(n: number): string {
  if (Math.abs(n) < 0.005) return 'text-emerald-700';
  return n > 0 ? 'text-blue-700' : 'text-red-700';
}

function diffPillClass(n: number): string {
  if (Math.abs(n) < 0.005) return 'bg-emerald-100 text-emerald-700';
  return n > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800';
}

// ---------- small parts ----------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4'>
      <div className='text-xs uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='mt-1 text-2xl font-mono text-slate-900'>{value}</div>
    </div>
  );
}

function MethodLabel({ m }: { m: string }) { return <span>{m.replace(/_/g, ' ')}</span>; }

// ---------- the single submit form ----------

function SubmitShiftInline({ row, collections, categories, users, onDone, onCancel }: {
  row: Row; collections: Collection[]; categories: Category[]; users: User[];
  onDone: (msg: string) => void; onCancel: () => void;
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
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const existing = collections.filter((c) => c.shiftId === row.shift.id && !c.voidedAt);
  const byMethod: Record<string, number> = {};
  for (const c of existing) byMethod[c.paymentMethod] = (byMethod[c.paymentMethod] ?? 0) + (parseFloat(c.amount) || 0);
  const existingTotal = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const existingCash = byMethod['CASH'] ?? 0;
  const existingMobile = Array.from(MOBILE_METHODS).reduce((a, m) => a + (byMethod[m] ?? 0), 0);

  const opening = parseFloat(row.shift.openingCash ?? '0') || 0;
  const cashIn = existingCash + (parseFloat(cash) || 0);
  const mobileIn = existingMobile + (parseFloat(mpesa) || 0) + (parseFloat(airtel) || 0) + (parseFloat(tigo) || 0) + (parseFloat(halo) || 0);
  const cashOut = expenses.reduce((a, e) => e.paymentMethod === 'CASH' ? a + (parseFloat(e.amount) || 0) : a, 0);
  const expected = opening + cashIn - cashOut;
  const actual = parseFloat(actualCash) || 0;
  const diff = actual - expected;

  function addExpense() {
    setExpenses((prev) => [...prev, {
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 8),
      categoryId: categories.length > 0 ? categories[0].id : '',
      amount: '', paymentMethod: 'CASH', description: '',
      paidByUserId: row.shift.userId ?? '',
    }]);
  }
  function updateExpense(id: string, patch: Partial<DraftExpense>) {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }
  function removeExpense(id: string) { setExpenses((prev) => prev.filter((e) => e.id !== id)); }

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
          categoryId: r.categoryId, amount: r.amount.trim(),
          paymentMethod: r.paymentMethod, description: r.description.trim(),
          paidByUserId: r.paidByUserId || null,
        }));
      await apiFetch('/api/v1/shifts/' + row.shift.id + '/submit', {
        method: 'POST',
        body: JSON.stringify({
          collections: collPayload,
          expenses: expensesPayload,
          cashHandedOver: actualCash.trim() || '0.00',
          notes: notes.trim() || null,
        }),
      });
      onDone(t('ops.cashFlow.flash.shiftClosed'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className='border-t border-slate-100 pt-3 space-y-4'>
      <h3 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.submitForm.heading')}</h3>

      <div className='rounded-xl bg-blue-50 border border-blue-100 p-3'>
        <div className='text-xs uppercase tracking-wide text-blue-900 mb-2'>{t('ops.cashFlow.submitForm.shiftHeading')}</div>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-3 text-sm'>
          <div><span className='block text-xs text-slate-500'>{t('form.businessDate')}</span><span className='font-mono text-slate-800'>{row.shift.businessDate}</span></div>
          <div><span className='block text-xs text-slate-500'>{t('table.waiter')}</span><span className='text-slate-800'>{row.name}</span></div>
          <div><span className='block text-xs text-slate-500'>{t('ops.cashFlow.submitForm.opening')}</span><span className='font-mono text-slate-800'>{row.shift.openingCash ?? '0.00'}</span></div>
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
                <MethodLabel m={m} /><span className='font-mono'>{v.toFixed(2)}</span>
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
        {expenses.length === 0 && <div className='text-sm text-slate-400'>{t('ops.cashFlow.submitForm.noExpenses')}</div>}
        {expenses.map((row2) => (
          <div key={row2.id} className='grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-3'>
            <div className='md:col-span-3'>
              <SelectField label={t('form.category')} value={row2.categoryId}
                onChange={(v) => updateExpense(row2.id, { categoryId: v })}
                options={categories.map((c) => ({ value: c.id, label: c.systemKey === 'SALARY' ? t('expenseCategory.SALARY') : c.name }))} />
            </div>
            <div className='md:col-span-2'>
              <DecimalField label={t('form.amount')} value={row2.amount} onChange={(v) => updateExpense(row2.id, { amount: v })} placeholder='0.00' />
            </div>
            <div className='md:col-span-2'>
              <SelectField label={t('form.paymentMethod')} value={row2.paymentMethod}
                onChange={(v) => updateExpense(row2.id, { paymentMethod: v })}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))} />
            </div>
            <div className='md:col-span-3'>
              <TextField label={t('form.description')} value={row2.description} onChange={(v) => updateExpense(row2.id, { description: v })} />
            </div>
            <div className='md:col-span-2'>
              <SelectField label={t('form.paidBy')} value={row2.paidByUserId}
                onChange={(v) => updateExpense(row2.id, { paidByUserId: v })}
                options={[{ value: '', label: t('common.notSpecified') }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]} />
            </div>
            {categories.find((c) => c.id === row2.categoryId)?.systemKey === 'SALARY' && (
              <div className='md:col-span-12 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1'>
                {t('ops.cashFlow.submitForm.salaryFor')} {row.name}
              </div>
            )}
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
          <DecimalField label={t('ops.cashFlow.submitForm.cashHandedOver')} value={actualCash} onChange={setActualCash} placeholder='0.00' />
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
        <button type='button' onClick={onCancel} disabled={busy}
          className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>{t('action.cancel')}</button>
        <button type='submit' disabled={busy}
          className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
          {busy ? t('ops.cashFlow.submitForm.submitting') : t('ops.cashFlow.submitForm.submit')}
        </button>
      </div>
    </form>
  );
}

// ---------- send back ----------

function SendBackInline({ onConfirm, onCancel, busy }: {
  onConfirm: (reason: string) => void; onCancel: () => void; busy: boolean;
}) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <div className='border-t border-slate-100 pt-3 space-y-2'>
      <input className='w-full rounded border border-slate-300 px-3 py-2 text-sm'
        placeholder={t('ops.cashFlow.row.sendBackPlaceholder')}
        value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className='flex gap-2 justify-end'>
        <button type='button' onClick={() => onConfirm(reason)} disabled={reason.trim().length < 3 || busy}
          className='rounded-lg bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
          {busy ? t('ops.shiftsDetail.working') : t('ops.cashFlow.row.action.sendBack')}
        </button>
        <button type='button' onClick={onCancel} disabled={busy}
          className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>{t('action.cancel')}</button>
      </div>
    </div>
  );
}

// ---------- shift row ----------

function ShiftRowCard({ row, isManager, busyKey, inline, dialog, collections, categories, users, onOpenInline, onCloseInline, onOpenDialog, onCloseDialog, onFinalize, onSendBack, onDone }: {
  row: Row; isManager: boolean; busyKey: string | null;
  inline: InlineForm; dialog: SubDialog;
  collections: Collection[]; categories: Category[]; users: User[];
  onOpenInline: (f: InlineForm) => void; onCloseInline: () => void;
  onOpenDialog: (d: SubDialog) => void; onCloseDialog: () => void;
  onFinalize: (shiftId: string) => void;
  onSendBack: (reconId: string, reason: string) => void;
  onDone: (msg: string) => void;
}) {
  const { t } = useT();
  const r = row;
  const isBusyRow = busyKey === 'sb:' + (r.recon?.id ?? '') || busyKey === 'fin:' + r.shift.id;
  const isOpenShift = r.shift.status === 'OPEN';
  const inlineForThisRow = inline?.shiftId === r.shift.id ? inline : null;
  const dialogForThisRow = dialog?.kind === 'send-back' && dialog.reconId === r.recon?.id ? dialog : null;

  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
      <div className='flex items-start gap-4'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-3 flex-wrap'>
            <span className='font-medium text-slate-900'>{r.name}</span>
            {(() => {
              const base = 'text-xs px-2 py-0.5 rounded-full ';
              const diff = r.recon?.cashDifference != null ? parseFloat(r.recon.cashDifference) || 0 : null;
              const cls = diff != null && Math.abs(diff) >= 0.005 ? base + diffPillClass(diff) : base + pillClass(r.state);
              return <span className={cls}>{t(stateKey(r.state))}</span>;
            })()}
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
          {r.sales != null && (
            <>
              <div className='mt-0.5 text-sm text-slate-600'>
                Sales: <span className='font-mono'>{r.sales}</span>
              </div>
              {(() => {
                const sNum = parseFloat(r.sales) || 0;
                const cNum = parseFloat(r.total) || 0;
                const d = cNum - sNum;
                return (
                  <div className={'mt-0.5 text-sm ' + diffClass(d)}>
                    Sales vs Collected: <span className='font-mono'>{d.toFixed(2)}</span>
                  </div>
                );
              })()}
            </>
          )}
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
                <div className={'mt-0.5 text-sm ' + diffClass(parseFloat(r.recon.cashDifference) || 0)}>
                  {t('ops.cashFlow.row.difference')}: <span className='font-mono'>{r.recon.cashDifference}</span>
                </div>
              )}
            </>
          )}
        </div>

        {isManager && isOpenShift && (
          <div className='flex gap-2 shrink-0'>
            <button type='button' onClick={() => onOpenInline({ kind: 'submit-shift', shiftId: r.shift.id })}
              disabled={isBusyRow}
              className='rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
              {t('ops.cashFlow.row.action.submit')}
            </button>
          </div>
        )}

        {isManager && (
          r.state === 'awaiting_review' || r.state === 'awaiting_handover' ||
          r.state === 'awaiting_confirm' || r.state === 'awaiting_close_mid' ||
          r.state === 'ready_to_close'
        ) && (
          <div className='flex gap-2 shrink-0'>
            <button type='button' onClick={() => onFinalize(r.shift.id)} disabled={isBusyRow}
              className='rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
              {busyKey === 'fin:' + r.shift.id
                ? t('ops.shiftsDetail.working')
                : ((r.recon?.status === 'SUBMITTED' || r.handover?.status === 'PENDING')
                    ? t('ops.cashFlow.row.action.approveAndFinalize')
                    : t('ops.cashFlow.row.action.finalize'))}
            </button>
            {r.state === 'awaiting_review' && r.recon && (
              <button type='button' onClick={() => onOpenDialog({ kind: 'send-back', reconId: r.recon!.id })} disabled={isBusyRow}
                className='rounded-lg border border-amber-300 text-amber-800 px-3 py-1.5 text-sm disabled:opacity-60'>
                {t('ops.cashFlow.row.action.sendBack')}
              </button>
            )}
          </div>
        )}
      </div>

      {inlineForThisRow?.kind === 'submit-shift' && (
        <SubmitShiftInline row={r} collections={collections} categories={categories} users={users}
          onCancel={onCloseInline} onDone={onDone} />
      )}

      {dialogForThisRow?.kind === 'send-back' && (
        <SendBackInline busy={busyKey === 'sb:' + dialogForThisRow.reconId}
          onCancel={onCloseDialog} onConfirm={(reason) => onSendBack(dialogForThisRow.reconId, reason)} />
      )}
    </div>
  );
}

// ---------- close today ----------

function CloseTodaySection({ todayClosing, allClosed, confirming, busyKey, onToggleConfirming, onCloseToday }: {
  todayClosing: Closing | null; allClosed: boolean; confirming: boolean;
  busyKey: string | null; onToggleConfirming: (v: boolean) => void; onCloseToday: () => void;
}) {
  const { t } = useT();
  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
      <h2 className='text-sm font-medium text-slate-700'>{t('ops.cashFlow.closeToday.heading')}</h2>
      {todayClosing ? (
        <div className='text-sm text-emerald-800'>{t('ops.cashFlow.closeToday.alreadyClosed')}</div>
      ) : allClosed ? (
        <>
          <div className='text-sm text-slate-600'>{t('ops.cashFlow.closeToday.ready')}</div>
          {confirming ? (
            <div className='flex gap-2'>
              <button type='button' onClick={onCloseToday} disabled={busyKey === 'day'}
                className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
                {busyKey === 'day' ? t('ops.cashFlow.closeToday.working') : t('ops.cashFlow.closeToday.button')}
              </button>
              <button type='button' onClick={() => onToggleConfirming(false)}
                className='rounded-lg border border-slate-300 px-4 py-2 text-sm'>{t('action.cancel')}</button>
            </div>
          ) : (
            <button type='button' onClick={() => onToggleConfirming(true)}
              className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium'>
              {t('ops.cashFlow.closeToday.button')}
            </button>
          )}
        </>
      ) : (
        <div className='text-sm text-slate-500'>{t('ops.cashFlow.closeToday.notReady')}</div>
      )}
    </section>
  );
}

// ---------- main page ----------

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState('');
  const [todayClosing, setTodayClosing] = useState<Closing | null>(null);
  const [summaries, setSummaries] = useState<SalesSummary[]>([]);

  const [inlineForm, setInlineForm] = useState<InlineForm>(null);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
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
      apiFetch<{ success: true; categories: Category[] }>('/api/v1/expense-categories').catch(() => ({ success: true as const, categories: [] as Category[] })),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users').catch(() => ({ success: true as const, users: [] as User[] })),
      apiFetch<{ success: true; user: User }>('/api/v1/auth/me').catch(() => ({ success: true as const, user: { id: '', fullName: '', role: '' } })),
      apiFetch<{ success: true; closings: Closing[] }>('/api/v1/daily-closings?businessDate=' + today).catch(() => ({ success: true as const, closings: [] as Closing[] })),
      apiFetch<{ success: true; summaries: SalesSummary[] }>('/api/v1/sales-summaries?businessDate=' + today).catch(() => ({ success: true as const, summaries: [] as SalesSummary[] })),
    ])
      .then(([sRes, cRes, rRes, hRes, eRes, catRes, uRes, meRes, dRes, ssRes]) => {
        setShifts(sRes.shifts.filter((s) => s.businessDate === today));
        setCollections(cRes.collections);
        setRecons(rRes.reconciliations);
        setHandovers(hRes.handovers);
        setExpenses(eRes.expenses);
        setCategories(catRes.categories.filter((c) => c.isActive));
        setUsers(uRes.users);
        setMyRole(meRes.user.role);
        setTodayClosing(dRes.closings.length > 0 ? dRes.closings[0] : null);
        setSummaries(ssRes.summaries);
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
      const user = users.find((u) => u.id === s.userId);
      const name = user?.fullName ?? (s.userId ? s.userId.slice(0, 8) : '');
      const salesRow = s.userId ? summaries.find((x) => x.businessDate === s.businessDate && x.userId === s.userId) : undefined;
      const sales = salesRow ? salesRow.totalSales : null;
      return {
        shift: s,
        total: total.toFixed(2),
        cashTotal: cashTotal.toFixed(2),
        mobileTotal: mobileTotal.toFixed(2),
        expenseTotal,
        state, name, recon, handover, sales,
      };
    });
  }, [shifts, collections, recons, handovers, expenses, users, summaries]);

  const summary = useMemo(() => {
    let open = 0, awaitingReview = 0, awaitingConfirm = 0, readyToClose = 0;
    for (const r of rows) {
      if (r.state === 'open' || r.state === 'awaiting_recon') open++;
      if (r.state === 'awaiting_review') awaitingReview++;
      if (r.state === 'awaiting_confirm') awaitingConfirm++;
      if (r.state === 'ready_to_close' || r.state === 'awaiting_close_mid') readyToClose++;
    }
    return { open, awaitingReview, awaitingConfirm, readyToClose };
  }, [rows]);

  const comparison = useMemo(() => {
    const totalSales = summaries.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);
    const totalCollected = rows.reduce((acc, r) => acc + (parseFloat(r.total) || 0), 0);
    const diff = totalCollected - totalSales;
    const matched = totalSales > 0 && Math.abs(diff) < 0.005;
    return { totalSales, totalCollected, diff, matched };
  }, [summaries, rows]);

  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';
  const allClosed = rows.length > 0 && rows.every((r) => r.state === 'closed');

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
        <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600'>
          {t('ops.cashFlow.autoOpenNotice')}
        </div>
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

          <section className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500 mb-2'>Total sales vs total collected</div>
            <div className='grid grid-cols-3 gap-4 text-sm'>
              <div>
                <div className='text-xs text-slate-500'>Sales</div>
                <div className='mt-1 font-mono text-slate-900'>{comparison.totalSales.toFixed(2)}</div>
              </div>
              <div>
                <div className='text-xs text-slate-500'>Collected</div>
                <div className='mt-1 font-mono text-slate-900'>{comparison.totalCollected.toFixed(2)}</div>
              </div>
              <div>
                <div className='text-xs text-slate-500'>Difference</div>
                <div className={'mt-1 font-mono ' + diffClass(comparison.diff)}>
                  {comparison.diff.toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          {rows.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500'>
              {t('ops.cashFlow.empty')}
            </div>
          ) : (
            <div className='space-y-3'>
              {rows.map((r) => (
                <ShiftRowCard key={r.shift.id} row={r} isManager={isManager} busyKey={busyKey}
                  inline={inlineForm} dialog={subDialog} collections={collections} categories={categories} users={users}
                  onOpenInline={setInlineForm} onCloseInline={() => setInlineForm(null)}
                  onOpenDialog={setSubDialog} onCloseDialog={() => setSubDialog(null)}
                  onFinalize={doFinalize} onSendBack={doSendBack} onDone={clearAndReload} />
              ))}
            </div>
          )}

          <CloseTodaySection todayClosing={todayClosing} allClosed={allClosed}
            confirming={closeDayConfirming} busyKey={busyKey}
            onToggleConfirming={setCloseDayConfirming} onCloseToday={doCloseToday} />
        </>
      )}


    </OpsShell>
  );
}
