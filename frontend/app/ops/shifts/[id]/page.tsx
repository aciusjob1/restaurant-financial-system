'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DecimalField, SelectField, TextField, TextArea, FormError,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type Shift = {
  id: string;
  userId: string;
  businessDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
  openingCash: string | null;
  startedAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  notes: string | null;
};

type Collection = {
  id: string;
  shiftId: string;
  userId: string;
  paymentMethod: string;
  amount: string;
  mobileReference: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

type User = { id: string; fullName: string; username: string; role: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function shiftStatusKey(s: string): keyof Dict {
  if (s === 'OPEN') return 'shiftStatus.open';
  if (s === 'SUBMITTED') return 'shiftStatus.submitted';
  if (s === 'RECONCILING') return 'shiftStatus.reconciling';
  return 'shiftStatus.closed';
}

export default function ShiftDetailPage() {
  const { t, tError } = useT();
  const params = useParams<{ id: string }>();
  const shiftId = params.id;

  const [shift, setShift] = useState<Shift | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState<string>('');
  const [myRole, setMyRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [mobileReference, setMobileReference] = useState('');
  const [collNotes, setCollNotes] = useState('');

  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [transitionReason, setTransitionReason] = useState('');
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    setErr(null);
    Promise.all([
      apiFetch<{ success: true; shift: Shift }>('/api/v1/shifts/' + shiftId),
      apiFetch<{ success: true; collections: Collection[] }>('/api/v1/collections?shiftId=' + shiftId),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users'),
      apiFetch<{ success: true; user: User }>('/api/v1/auth/me').catch(() => ({ success: true as const, user: { id: '', fullName: '', username: '', role: '' } })),
    ])
      .then(([sRes, cRes, uRes, meRes]) => {
        setShift(sRes.shift);
        setCollections(cRes.collections);
        setUsers(uRes.users);
        setMyId(meRes.user.id);
        setMyRole(meRes.user.role);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [shiftId]);

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  async function addCollection(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections', {
        method: 'POST',
        body: JSON.stringify({
          shiftId,
          paymentMethod,
          amount,
          mobileReference: mobileReference.trim() === '' ? null : mobileReference.trim(),
          notes: collNotes.trim() === '' ? null : collNotes.trim(),
        }),
      });
      setAmount('');
      setMobileReference('');
      setCollNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function voidCollection() {
    if (!voidId) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/collections/' + voidId + '/void', {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidId(null);
      setVoidReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function transition(to: string, reason?: string) {
    setErr(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { to };
      if (reason) body.reason = reason;
      await apiFetch('/api/v1/shifts/' + shiftId + '/transition', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPendingTo(null);
      setTransitionReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <OpsShell>
        <OpsHeader title={t('ops.shiftsDetail.title')} />
        <div className='text-slate-500'>{t('common.loading')}</div>
      </OpsShell>
    );
  }

  if (!shift) {
    return (
      <OpsShell>
        <OpsHeader title={t('ops.shiftsDetail.title')} />
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <Link href='/ops/shifts' className='text-sm text-slate-700 underline'>
          {t('ops.shiftsDetail.backList')}
        </Link>
      </OpsShell>
    );
  }

  const isOpen = shift.status === 'OPEN';
  const isOwnerWaiter = myRole === 'WAITER' && myId === shift.userId;
  const activeCollections = collections.filter((c) => !c.voidedAt);
  const activeTotal = activeCollections.reduce((s, c) => s + parseFloat(c.amount), 0);

  const transitions: Array<{ to: string; label: string; variant: 'primary' | 'secondary' }> = [];
  if (shift.status === 'OPEN') {
    transitions.push({ to: 'SUBMITTED', label: t('ops.shiftsDetail.transitionSubmit'), variant: 'primary' });
  }
  if (shift.status === 'SUBMITTED') {
    transitions.push({ to: 'RECONCILING', label: t('ops.shiftsDetail.transitionMoveToReconciling'), variant: 'primary' });
    transitions.push({ to: 'OPEN', label: t('ops.shiftsDetail.transitionSendBackToOpen'), variant: 'secondary' });
  }
  if (shift.status === 'RECONCILING') {
    transitions.push({ to: 'CLOSED', label: t('ops.shiftsDetail.transitionClose'), variant: 'primary' });
    transitions.push({ to: 'SUBMITTED', label: t('ops.shiftsDetail.transitionSendBackToSubmitted'), variant: 'secondary' });
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.shiftsDetail.title') + ' ' + shift.businessDate}
        subtitle={userName(shift.userId) + ' \\u2014 ' + t(shiftStatusKey(shift.status))}
      />

      <div className='flex flex-wrap items-center gap-3 text-sm'>
        <Link href='/ops/shifts' className='text-slate-500 hover:text-slate-900'>
          {t('ops.shiftsDetail.backAll')}
        </Link>
        <span className='rounded bg-slate-100 px-2 py-0.5 text-xs'>{t(shiftStatusKey(shift.status))}</span>
      </div>

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

      <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-2'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.shiftsDetail.infoHeading')}</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3 text-sm'>
          <div><span className='text-slate-500'>{t('ops.shiftsDetail.labelUser')}: </span>{userName(shift.userId)}</div>
          <div><span className='text-slate-500'>{t('ops.shiftsDetail.labelBusinessDate')}: </span>{shift.businessDate}</div>
          <div><span className='text-slate-500'>{t('ops.shiftsDetail.labelOpeningCash')}: </span><span className='font-mono'>{shift.openingCash ?? '\\u2014'}</span></div>
          <div><span className='text-slate-500'>{t('ops.shiftsDetail.labelStarted')}: </span>{shift.startedAt}</div>
          <div><span className='text-slate-500'>{t('ops.shiftsDetail.labelSubmitted')}: </span>{shift.submittedAt ?? '\\u2014'}</div>
          <div><span className='text-slate-500'>{t('ops.shiftsDetail.labelClosed')}: </span>{shift.closedAt ?? '\\u2014'}</div>
        </div>
        {shift.notes && <div className='text-sm text-slate-600'>{shift.notes}</div>}
        {shift.reopenReason && (
          <div className='text-sm text-amber-700'>
            {t('ops.shiftsDetail.reopenedPrefix')}{shift.reopenReason}
          </div>
        )}
      </div>

      {transitions.length > 0 && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
          <h2 className='text-sm font-medium text-slate-700'>{t('ops.shiftsDetail.transitionsHeading')}</h2>
          <div className='flex flex-wrap gap-2'>
            {transitions.map((tr) => (
              <button
                key={tr.to}
                type='button'
                onClick={() => setPendingTo(tr.to)}
                disabled={busy}
                className={
                  tr.variant === 'secondary'
                    ? 'rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60'
                    : 'rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                }
              >
                {tr.label}
              </button>
            ))}
          </div>
          {pendingTo && (
            <div className='space-y-2 border-t border-slate-100 pt-3'>
              <TextArea
                label={t('ops.shiftsDetail.reasonPrefix') + t(shiftStatusKey(pendingTo)) + t('ops.shiftsDetail.reasonSuffix')}
                value={transitionReason}
                onChange={setTransitionReason}
                rows={2}
              />
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={() => transition(pendingTo, transitionReason)}
                  disabled={busy}
                  className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                >
                  {busy ? t('ops.shiftsDetail.working') : t('action.confirm')}
                </button>
                <button
                  type='button'
                  onClick={() => { setPendingTo(null); setTransitionReason(''); }}
                  className='rounded-lg border border-slate-300 px-4 py-2 text-sm'
                >
                  {t('action.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-sm font-medium text-slate-700'>{t('ops.shiftsDetail.collectionsHeading')}</h2>
          <div className='text-xs text-slate-500'>
            {t('ops.shiftsDetail.activeTotal')} <span className='font-mono'>{activeTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='text-left px-2 py-2 font-medium'>{t('table.method')}</th>
                <th className='text-right px-2 py-2 font-medium w-32'>{t('table.amount')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.reference')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.by')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.status')}</th>
                <th className='w-24' />
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 && (
                <tr>
                  <td colSpan={6} className='px-2 py-4 text-center text-slate-400'>
                    {t('ops.shiftsDetail.noCollectionsYet')}
                  </td>
                </tr>
              )}
              {collections.map((c) => (
                <tr key={c.id} className='border-t border-slate-100'>
                  <td className='px-2 py-2'>{c.paymentMethod}</td>
                  <td className='px-2 py-2 text-right font-mono'>{c.amount}</td>
                  <td className='px-2 py-2 text-slate-500'>{c.mobileReference ?? '\\u2014'}</td>
                  <td className='px-2 py-2 text-slate-500'>{userName(c.userId)}</td>
                  <td className='px-2 py-2'>
                    {c.voidedAt
                      ? <span className='text-xs rounded bg-red-100 text-red-700 px-2 py-0.5'>{t('status.voided')}</span>
                      : <span className='text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5'>{t('status.active')}</span>}
                  </td>
                  <td className='px-2 py-2 text-right'>
                    {!c.voidedAt && isOpen && (
                      voidId === c.id ? (
                        <div className='space-y-1'>
                          <input
                            className='w-full rounded border border-slate-300 px-2 py-1 text-xs'
                            placeholder={t('ops.shiftsDetail.voidReasonPlaceholder')}
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                          />
                          <div className='flex gap-1 justify-end'>
                            <button
                              type='button'
                              onClick={voidCollection}
                              disabled={voidReason.trim().length < 3}
                              className='text-xs rounded bg-red-600 text-white px-2 py-1 disabled:opacity-60'
                            >
                              {t('action.void')}
                            </button>
                            <button
                              type='button'
                              onClick={() => { setVoidId(null); setVoidReason(''); }}
                              className='text-xs text-slate-600'
                            >
                              {t('action.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type='button'
                          onClick={() => { setVoidId(c.id); setVoidReason(''); }}
                          className='text-xs text-red-600 hover:text-red-800'
                        >
                          {t('action.void')}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isOpen && isOwnerWaiter && (
          <form onSubmit={addCollection} className='border-t border-slate-100 pt-4 space-y-3'>
            <h3 className='text-xs font-medium text-slate-600'>{t('kiosk.collections.addHeading')}</h3>
            <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
              <SelectField
                label={t('form.method')}
                value={paymentMethod}
                onChange={setPaymentMethod}
                required
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
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
              <div className='flex items-end pb-1'>
                <button
                  type='submit'
                  disabled={busy}
                  className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                >
                  {busy ? t('kiosk.collections.addingButton') : t('action.add')}
                </button>
              </div>
            </div>
            <TextArea label={t('form.notesOptional')} value={collNotes} onChange={setCollNotes} rows={2} />
          </form>
        )}
      </div>
    </OpsShell>
  );
}
