'use client';

import { useEffect, useState, type FormEvent } from 'react';
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

type Me = { id: string; fullName: string; role: string };

type Shift = {
  id: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  notes: string | null;
};

type Collection = {
  id: string;
  shiftId: string;
  paymentMethod: string;
  amount: string;
  mobileReference: string | null;
  voidedAt: string | null;
};

type Reconciliation = {
  id: string;
  shiftId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  expectedCash: string;
  expectedMobile: string;
  actualCash: string | null;
  actualMobile: string | null;
  cashDifference: string | null;
  mobileDifference: string | null;
};

type Handover = {
  id: string;
  reconciliationId: string;
  amount: string;
  status: 'PENDING' | 'CONFIRMED';
  toUserId: string;
  confirmedAt: string | null;
};

type Receiver = { id: string; fullName: string; role: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function KioskPage() {
  const { t, tError } = useT();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [closedToday, setClosedToday] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [amount, setAmount] = useState('');
  const [mobileReference, setMobileReference] = useState('');
  const [collNotes, setCollNotes] = useState('');

  const [actualCash, setActualCash] = useState('');
  const [actualMobile, setActualMobile] = useState('');
  const [reconNotes, setReconNotes] = useState('');

  const [receiverId, setReceiverId] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const meRes = await apiFetch<{ success: true; user: Me }>('/api/v1/auth/me');
      setMe(meRes.user);

      const shiftsRes = await apiFetch<{ success: true; shifts: Shift[] }>('/api/v1/shifts');
      const active = shiftsRes.shifts.find((s) => s.status !== 'CLOSED') || null;
      setShift(active);
      const today = todayISO();
      setClosedToday(!active && shiftsRes.shifts.some((s) => s.status === 'CLOSED' && s.businessDate === today));

      if (!active) {
        setCollections([]);
        setRecon(null);
        setHandover(null);
        setReceivers([]);
        return;
      }

      const cRes = await apiFetch<{ success: true; collections: Collection[] }>(
        '/api/v1/collections?shiftId=' + active.id
      );
      setCollections(cRes.collections);

      const rRes = await apiFetch<{ success: true; reconciliations: Reconciliation[] }>(
        '/api/v1/reconciliations?shiftId=' + active.id
      );
      const r = rRes.reconciliations[0] || null;
      setRecon(r);

      if (r) {
        setActualCash((prev) => (prev === '' ? (r.actualCash ?? '') : prev));
        setActualMobile((prev) => (prev === '' ? (r.actualMobile ?? '') : prev));
      } else {
        setActualCash('');
        setActualMobile('');
      }

      if (r) {
        const hRes = await apiFetch<{ success: true; handovers: Handover[] }>(
          '/api/v1/handovers?reconciliationId=' + r.id
        );
        setHandover(hRes.handovers[0] || null);
      } else {
        setHandover(null);
      }

      if (r && (r.status === 'SUBMITTED' || r.status === 'REVIEWED')) {
        const uRes = await apiFetch<{ success: true; users: Receiver[] }>(
          '/api/v1/handovers/receivable-users'
        );
        setReceivers(uRes.users);
      } else {
        setReceivers([]);
      }
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  type KioskState =
    | { kind: 'loading' }
    | { kind: 'no-shift' }
    | { kind: 'day-done' }
    | { kind: 'shift-open' }
    | { kind: 'shift-submitted-no-recon' }
    | { kind: 'recon-draft' }
    | { kind: 'recon-submitted-no-handover' }
    | { kind: 'handover-pending' }
    | { kind: 'handover-confirmed' }
    | { kind: 'waiting-manager' };

  const state: KioskState = (() => {
    if (loading) return { kind: 'loading' };
    if (!shift) return closedToday ? { kind: 'day-done' } : { kind: 'no-shift' };
    if (shift.status === 'OPEN') return { kind: 'shift-open' };
    if (shift.status === 'RECONCILING') return { kind: 'waiting-manager' };
    if (!recon) return { kind: 'shift-submitted-no-recon' };
    if (recon.status === 'DRAFT') return { kind: 'recon-draft' };
    if (!handover) return { kind: 'recon-submitted-no-handover' };
    if (handover.status === 'PENDING') return { kind: 'handover-pending' };
    return { kind: 'handover-confirmed' };
  })();



  async function addCollection(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          ...(shift ? { shiftId: shift.id } : {}),
          paymentMethod,
          amount,
          mobileReference: mobileReference.trim() === '' ? null : mobileReference.trim(),
          notes: collNotes.trim() === '' ? null : collNotes.trim(),
        }),
      });
      setAmount('');
      setMobileReference('');
      setCollNotes('');
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitShift() {
    if (!shift) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/shifts/' + shift.id + '/transition', {
        method: 'POST',
        body: JSON.stringify({ to: 'SUBMITTED' }),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createReconciliation() {
    if (!shift) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations', {
        method: 'POST',
        body: JSON.stringify({ shiftId: shift.id }),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveActuals(e: FormEvent) {
    e.preventDefault();
    if (!recon) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations/' + recon.id, {
        method: 'PATCH',
        body: JSON.stringify({
          actualCash,
          actualMobile,
          notes: reconNotes.trim() === '' ? null : reconNotes.trim(),
        }),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReconciliation() {
    if (!recon) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations/' + recon.id + '/submit', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createHandover(e: FormEvent) {
    e.preventDefault();
    if (!recon) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/handovers', {
        method: 'POST',
        body: JSON.stringify({
          reconciliationId: recon.id,
          toUserId: receiverId,
          notes: handoverNotes.trim() === '' ? null : handoverNotes.trim(),
        }),
      });
      setHandoverNotes('');
      setReceiverId('');
      await refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  const activeCollections = collections.filter((c) => !c.voidedAt);
  const collectionsTotal = activeCollections.reduce((s, c) => s + parseFloat(c.amount), 0);

  function receiverName(id: string): string {
    const r = receivers.find((x) => x.id === id);
    return r ? r.fullName : id.slice(0, 8);
  }

  if (state.kind === 'loading') {
    return (
      <KioskShell>
        <KioskHeader
          title={t('kiosk.home.brandTitle')}
          subtitle={t('kiosk.home.loadingSubtitle')}
        />
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <KioskHeader
        title={
          me
            ? t('kiosk.home.greetingPrefix') + me.fullName.split(' ')[0]
            : t('kiosk.home.brandTitle')
        }
        subtitle={t('kiosk.home.subtitle')}
      />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

      {state.kind === 'day-done' && (
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 space-y-2'>
          <div className='text-lg font-medium'>{t('kiosk.dayDone.heading')}</div>
          <div className='text-sm'>{t('kiosk.dayDone.body')}</div>
        </div>
      )}

      {(state.kind === 'shift-open' || state.kind === 'no-shift') && (
        <>
          {shift ? (
            <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-2'>
              <div className='flex items-center justify-between'>
                <h2 className='text-base font-medium text-slate-900'>
                  {t('kiosk.shiftOpen.heading')}
                </h2>
                <span className='text-xs text-slate-500'>
                  {t('kiosk.shiftOpen.startedPrefix')}{shift.startedAt}
                </span>
              </div>
              <div className='grid grid-cols-2 md:grid-cols-3 gap-3 text-sm'>
                <div>
                  <span className='text-slate-500'>{t('kiosk.shiftOpen.dateLabel')}</span>
                  {shift.businessDate}
                </div>
                <div>
                  <span className='text-slate-500'>{t('kiosk.shiftOpen.openingCashLabel')}</span>
                  <span className='font-mono'>{shift.openingCash ?? '\u2014'}</span>
                </div>
                <div>
                  <span className='text-slate-500'>{t('kiosk.shiftOpen.collectionsTotalLabel')}</span>
                  <span className='font-mono'>{collectionsTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className='rounded-2xl border border-slate-200 bg-slate-50 p-5'>
              <p className='text-sm text-slate-600'>
                {t('kiosk.noShift.autoOpenBody')}
              </p>
            </div>
          )}

          <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
            <h2 className='text-base font-medium text-slate-900'>
              {t('kiosk.collections.heading')}
            </h2>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left px-2 py-2 font-medium'>{t('form.method')}</th>
                    <th className='text-right px-2 py-2 font-medium'>{t('table.amount')}</th>
                    <th className='text-left px-2 py-2 font-medium'>{t('table.reference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.length === 0 && (
                    <tr>
                      <td colSpan={3} className='px-2 py-3 text-center text-slate-400'>
                        {t('kiosk.collections.empty')}
                      </td>
                    </tr>
                  )}
                  {collections.map((c) => (
                    <tr key={c.id} className='border-t border-slate-100'>
                      <td className='px-2 py-2'>{c.paymentMethod}</td>
                      <td className='px-2 py-2 text-right font-mono'>{c.amount}</td>
                      <td className='px-2 py-2 text-slate-500'>
                        {c.mobileReference ?? '\u2014'}
                        {c.voidedAt && (
                          <span className='ml-2 text-xs text-red-600'>
                            {t('kiosk.collections.voided')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={addCollection} className='border-t border-slate-100 pt-3 space-y-3'>
              <h3 className='text-xs font-medium text-slate-600'>
                {t('kiosk.collections.addHeading')}
              </h3>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <SelectField
                  label={t('form.method')}
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  required
                  options={PAYMENT_METHODS.map((m) => ({
                    value: m,
                    label: m.replace(/_/g, ' '),
                  }))}
                />
                <DecimalField
                  label={t('form.amount')}
                  value={amount}
                  onChange={setAmount}
                  required
                  placeholder='0.00'
                />
                <TextField
                  label={t('form.mobileRef')}
                  value={mobileReference}
                  onChange={setMobileReference}
                  placeholder={t('form.mobileRefPlaceholder')}
                />
              </div>
              <TextArea
                label={t('form.notesOptional')}
                value={collNotes}
                onChange={setCollNotes}
                rows={2}
              />
              <button
                type='submit'
                disabled={busy}
                className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
              >
                {busy
                  ? t('kiosk.collections.addingButton')
                  : t('kiosk.collections.addButton')}
              </button>
            </form>
          </div>

          {shift && (
            <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
              <h2 className='text-base font-medium text-slate-900'>
                {t('kiosk.readyToFinish.heading')}
              </h2>
              <div className='text-sm text-slate-600'>
                {t('kiosk.readyToFinish.body')}
              </div>
              {shift.openingCash === null && (
                <div className='text-xs text-amber-700'>
                  {t('kiosk.readyToFinish.openingCashWarning')}
                </div>
              )}
              <button
                type='button'
                onClick={submitShift}
                disabled={busy}
                className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
              >
                {busy
                  ? t('kiosk.readyToFinish.submittingButton')
                  : t('kiosk.readyToFinish.submitButton')}
              </button>
            </div>
          )}
        </>
      )}

      {state.kind === 'shift-submitted-no-recon' && shift && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('kiosk.shiftSubmitted.heading')}
          </h2>
          <div className='text-sm text-slate-600'>
            {t('kiosk.shiftSubmitted.body')}
          </div>
          <button
            type='button'
            onClick={createReconciliation}
            disabled={busy}
            className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
          >
            {busy
              ? t('kiosk.shiftSubmitted.creatingButton')
              : t('kiosk.shiftSubmitted.createButton')}
          </button>
        </div>
      )}

      {state.kind === 'recon-draft' && recon && (
        <form onSubmit={saveActuals} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('kiosk.reconDraft.heading')}
          </h2>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-3 text-sm'>
            <div>
              <div className='text-xs text-slate-500'>
                {t('kiosk.reconDraft.expectedCash')}
              </div>
              <div className='font-mono'>{recon.expectedCash}</div>
            </div>
            <div>
              <div className='text-xs text-slate-500'>
                {t('kiosk.reconDraft.expectedMobile')}
              </div>
              <div className='font-mono'>{recon.expectedMobile}</div>
            </div>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <DecimalField
              label={t('form.actualCash')}
              value={actualCash}
              onChange={setActualCash}
              required
              placeholder='0.00'
            />
            <DecimalField
              label={t('form.actualMobile')}
              value={actualMobile}
              onChange={setActualMobile}
              required
              placeholder='0.00'
            />
          </div>
          <TextArea
            label={t('form.notesOptional')}
            value={reconNotes}
            onChange={setReconNotes}
            rows={2}
          />
          <div className='flex flex-wrap gap-2'>
            <button
              type='submit'
              disabled={busy}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60'
            >
              {busy
                ? t('kiosk.reconDraft.savingButton')
                : t('kiosk.reconDraft.saveButton')}
            </button>
            <button
              type='button'
              onClick={submitReconciliation}
              disabled={busy || actualCash.trim() === '' || actualMobile.trim() === ''}
              className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
            >
              {busy
                ? t('kiosk.reconDraft.submittingButton')
                : t('kiosk.reconDraft.submitButton')}
            </button>
          </div>
          <div className='text-xs text-slate-500'>
            {t('kiosk.reconDraft.note')}
          </div>
        </form>
      )}

      {state.kind === 'recon-submitted-no-handover' && recon && (
        <form onSubmit={createHandover} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('kiosk.handover.heading')}
          </h2>
          <div className='text-sm text-slate-600'>
            {t('kiosk.handover.body')}
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <SelectField
              label={t('form.receiver')}
              value={receiverId}
              onChange={setReceiverId}
              required
              options={[
                { value: '', label: t('form.selectPlaceholder') },
                ...receivers.map((r) => ({
                  value: r.id,
                  label: r.fullName + ' (' + r.role + ')',
                })),
              ]}
            />
          </div>
          <TextArea
            label={t('form.notesOptional')}
            value={handoverNotes}
            onChange={setHandoverNotes}
            rows={2}
          />
          <button
            type='submit'
            disabled={busy || receiverId === ''}
            className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
          >
            {busy
              ? t('kiosk.handover.creatingButton')
              : t('kiosk.handover.createButton')}
          </button>
          {receivers.length === 0 && (
            <div className='text-xs text-amber-700'>
              {t('kiosk.handover.noReceivers')}
            </div>
          )}
        </form>
      )}

      {state.kind === 'handover-pending' && handover && (
        <div className='rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 space-y-2'>
          <div className='text-lg font-medium'>
            {t('kiosk.handoverPending.heading')}
          </div>
          <div className='text-sm'>
            {t('kiosk.handoverPending.bodyPrefix')}
            <span className='font-mono'>{handover.amount}</span>
            {t('kiosk.handoverPending.bodyMid')}
            {receiverName(handover.toUserId)}
            {t('kiosk.handoverPending.bodySuffix')}
          </div>
          <div className='text-xs'>{t('kiosk.handoverPending.hint')}</div>
          <button
            type='button'
            onClick={refresh}
            disabled={loading}
            className='mt-2 rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-sm disabled:opacity-60'
          >
            {loading
              ? t('kiosk.refreshingButton')
              : t('kiosk.refreshButton')}
          </button>
        </div>
      )}

      {state.kind === 'handover-confirmed' && handover && (
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 space-y-2'>
          <div className='text-lg font-medium'>
            {t('kiosk.handoverConfirmed.heading')}
          </div>
          <div className='text-sm'>
            <span className='font-mono'>{handover.amount}</span>
            {t('kiosk.handoverConfirmed.bodyPrefix')}
            {receiverName(handover.toUserId)}
            {t('kiosk.handoverConfirmed.bodySuffix')}
          </div>
          <div className='text-xs'>{t('kiosk.handoverConfirmed.hint')}</div>
          <button
            type='button'
            onClick={refresh}
            disabled={loading}
            className='mt-2 rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-sm disabled:opacity-60'
          >
            {loading
              ? t('kiosk.refreshingButton')
              : t('kiosk.refreshButton')}
          </button>
        </div>
      )}

      {state.kind === 'waiting-manager' && (
        <div className='rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 space-y-2'>
          <div className='text-lg font-medium text-slate-900'>
            {t('kiosk.waitingManager.heading')}
          </div>
          <div className='text-sm'>{t('kiosk.waitingManager.message')}</div>
          <button
            type='button'
            onClick={refresh}
            disabled={loading}
            className='mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'
          >
            {loading
              ? t('kiosk.refreshingButton')
              : t('kiosk.refreshButton')}
          </button>
        </div>
      )}
    </KioskShell>
  );
}
