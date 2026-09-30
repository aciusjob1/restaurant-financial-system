'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DecimalField, TextArea, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type Reconciliation = {
  id: string;
  shiftId: string;
  userId: string;
  expectedCash: string;
  expectedMobile: string;
  actualCash: string | null;
  actualMobile: string | null;
  cashDifference: string | null;
  mobileDifference: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  notes: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Shift = { id: string; userId: string; businessDate: string; status: string };
type User = { id: string; fullName: string; username: string; role: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function reconStatusKey(s: string): keyof Dict {
  if (s === 'SUBMITTED') return 'reconStatus.submitted';
  if (s === 'REVIEWED') return 'reconStatus.reviewed';
  return 'reconStatus.draft';
}

function diffClass(v: string | null): string {
  if (v === null) return 'text-slate-400';
  const n = parseFloat(v);
  if (n === 0) return 'text-slate-500';
  return n > 0 ? 'text-emerald-700' : 'text-red-700';
}

export default function ReconciliationDetailPage() {
  const { t, tError } = useT();
  const params = useParams<{ id: string }>();
  const reconId = params.id;

  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState<string>('');
  const [myRole, setMyRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [actualCash, setActualCash] = useState('');
  const [actualMobile, setActualMobile] = useState('');
  const [notes, setNotes] = useState('');

  const [reviewNotes, setReviewNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [handover, setHandover] = useState<{
    id: string;
    status: 'PENDING' | 'CONFIRMED';
    amount: string;
    toUserId: string;
    confirmedAt: string | null;
  } | null>(null);
  const [receiverId, setReceiverId] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverBusy, setHandoverBusy] = useState(false);

  function load() {
    setLoading(true);
    setErr(null);
    apiFetch<{ success: true; reconciliation: Reconciliation }>('/api/v1/reconciliations/' + reconId)
      .then((r) => {
        setRec(r.reconciliation);
        setActualCash(r.reconciliation.actualCash ?? '');
        setActualMobile(r.reconciliation.actualMobile ?? '');
        setNotes(r.reconciliation.notes ?? '');
        return apiFetch<{ success: true; shift: Shift }>('/api/v1/shifts/' + r.reconciliation.shiftId);
      })
      .then((sr) => setShift(sr.shift))
      .then(() =>
        apiFetch<{ success: true; handovers: Array<{ id: string; status: 'PENDING' | 'CONFIRMED'; amount: string; toUserId: string; confirmedAt: string | null; reconciliationId: string }> }>(
          '/api/v1/handovers?reconciliationId=' + reconId
        )
      )
      .then((hr) => setHandover(hr.handovers.length > 0 ? hr.handovers[0] : null))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [reconId]);

  useEffect(() => {
    apiFetch<{ success: true; user: User }>('/api/v1/auth/me')
      .then((r) => { setMyId(r.user.id); setMyRole(r.user.role); })
      .catch(() => {});
    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  async function saveActuals(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations/' + reconId, {
        method: 'PATCH',
        body: JSON.stringify({
          actualCash,
          actualMobile,
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReconciliation() {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations/' + reconId + '/submit', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function review(decision: 'APPROVE' | 'SEND_BACK') {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/reconciliations/' + reconId + '/review', {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reviewNotes: reviewNotes.trim() === '' ? undefined : reviewNotes.trim(),
        }),
      });
      setReviewNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createHandover() {
    setErr(null);
    if (!receiverId) {
      setErr({ code: 'RECEIVER_REQUIRED', message: 'Select a manager or owner.' });
      return;
    }
    setHandoverBusy(true);
    try {
      await apiFetch('/api/v1/handovers', {
        method: 'POST',
        body: JSON.stringify({
          reconciliationId: reconId,
          toUserId: receiverId,
          notes: handoverNotes.trim() === '' ? null : handoverNotes.trim(),
        }),
      });
      setReceiverId('');
      setHandoverNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setHandoverBusy(false);
    }
  }

  if (loading) {
    return (
      <OpsShell>
        <OpsHeader title={t('ops.reconciliationsDetail.title')} />
        <div className='text-slate-500'>{t('common.loading')}</div>
      </OpsShell>
    );
  }

  if (!rec) {
    return (
      <OpsShell>
        <OpsHeader title={t('ops.reconciliationsDetail.title')} />
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <Link href='/ops/reconciliations' className='text-sm text-slate-700 underline'>
          {t('ops.reconciliationsDetail.backList')}
        </Link>
      </OpsShell>
    );
  }

  const isDraft = rec.status === 'DRAFT';
  const isSubmitted = rec.status === 'SUBMITTED';
  const isReviewed = rec.status === 'REVIEWED';
  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';
  const isOwnerWaiter = myRole === 'WAITER' && myId === rec.userId;

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.reconciliationsDetail.title') + ' ' + rec.id.slice(0, 8) + '\u2026'}
        subtitle={userName(rec.userId) + (shift ? ' \u2014 ' + shift.businessDate : '') + ' \u2014 ' + t(reconStatusKey(rec.status))}
      />

      <div className='flex flex-wrap items-center gap-3 text-sm'>
        <Link href='/ops/reconciliations' className='text-slate-500 hover:text-slate-900'>
          {t('ops.reconciliationsDetail.backAll')}
        </Link>
        <span className='rounded bg-slate-100 px-2 py-0.5 text-xs'>{t(reconStatusKey(rec.status))}</span>
      </div>

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

      <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.reconciliationsDetail.summaryHeading')}</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
          <div>
            <div className='text-xs text-slate-500'>{t('ops.reconciliationsDetail.labelExpectedCash')}</div>
            <div className='font-mono'>{rec.expectedCash}</div>
          </div>
          <div>
            <div className='text-xs text-slate-500'>{t('ops.reconciliationsDetail.labelActualCash')}</div>
            <div className='font-mono'>{rec.actualCash ?? '\u2014'}</div>
          </div>
          <div>
            <div className='text-xs text-slate-500'>{t('ops.reconciliationsDetail.labelCashDifference')}</div>
            <div className={'font-mono ' + diffClass(rec.cashDifference)}>{rec.cashDifference ?? '\u2014'}</div>
          </div>
          <div>
            <div className='text-xs text-slate-500'>{t('ops.reconciliationsDetail.labelExpectedMobile')}</div>
            <div className='font-mono'>{rec.expectedMobile}</div>
          </div>
          <div>
            <div className='text-xs text-slate-500'>{t('ops.reconciliationsDetail.labelActualMobile')}</div>
            <div className='font-mono'>{rec.actualMobile ?? '\u2014'}</div>
          </div>
          <div>
            <div className='text-xs text-slate-500'>{t('ops.reconciliationsDetail.labelMobileDifference')}</div>
            <div className={'font-mono ' + diffClass(rec.mobileDifference)}>{rec.mobileDifference ?? '\u2014'}</div>
          </div>
        </div>
        {rec.notes && (
          <div className='text-sm text-slate-600'>
            <span className='text-slate-500'>{t('ops.reconciliationsDetail.labelNotes')}: </span>{rec.notes}
          </div>
        )}
        {rec.submittedAt && (
          <div className='text-xs text-slate-500'>
            {t('ops.reconciliationsDetail.submittedAtPrefix')}{rec.submittedAt}
          </div>
        )}
        {rec.reviewedAt && (
          <div className='text-xs text-slate-500'>
            {t('ops.reconciliationsDetail.reviewedByPrefix')}{userName(rec.reviewedBy || '')}{t('ops.reconciliationsDetail.reviewedAtMid')}{rec.reviewedAt}
            {rec.reviewNotes && <> \u2014 {rec.reviewNotes}</>}
          </div>
        )}
      </div>

      {isDraft && isOwnerWaiter && (
        <form onSubmit={saveActuals} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-sm font-medium text-slate-700'>{t('ops.reconciliationsDetail.enterActuals')}</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <DecimalField label={t('form.actualCash')} value={actualCash} onChange={setActualCash} required placeholder='0.00' />
            <DecimalField label={t('form.actualMobile')} value={actualMobile} onChange={setActualMobile} required placeholder='0.00' />
          </div>
          <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />
          <div className='flex flex-wrap gap-2'>
            <button
              type='submit'
              disabled={busy}
              className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
            >
              {busy ? t('ops.shiftsDetail.working') : t('ops.reconciliationsDetail.saveActuals')}
            </button>
            <button
              type='button'
              onClick={submitReconciliation}
              disabled={busy || actualCash.trim() === '' || actualMobile.trim() === ''}
              className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
            >
              {t('action.submitForReview')}
            </button>
          </div>
          <div className='text-xs text-slate-500'>
            {t('ops.reconciliationsDetail.requireActuals')}
          </div>
        </form>
      )}

      {isSubmitted && isManager && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-sm font-medium text-slate-700'>{t('ops.reconciliationsDetail.reviewHeading')}</h2>
          <TextArea
            label={t('ops.reconciliationsDetail.reviewNotesOptional')}
            value={reviewNotes}
            onChange={setReviewNotes}
            rows={2}
          />
          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={() => review('APPROVE')}
              disabled={busy}
              className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
            >
              {busy ? t('ops.shiftsDetail.working') : t('action.approve')}
            </button>
            <button
              type='button'
              onClick={() => review('SEND_BACK')}
              disabled={busy}
              className='rounded-lg border border-amber-300 text-amber-800 px-4 py-2 text-sm disabled:opacity-60'
            >
              {t('ops.reconciliationsDetail.sendBack')}
            </button>
          </div>
        </div>
      )}

      {isSubmitted && !isManager && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600'>
          {t('ops.reconciliationsDetail.waitingReview')}
        </div>
      )}
      {isDraft && isManager && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600'>
          {t('ops.reconciliationsDetail.draftOwnedPrefix')}{userName(rec.userId)}{t('ops.reconciliationsDetail.draftOwnedSuffix')}
        </div>
      )}
      {isReviewed && (
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800'>
          {t('ops.reconciliationsDetail.reviewedApproved')}
        </div>
      )}

      {(isSubmitted || isReviewed) && rec.actualCash !== null && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-sm font-medium text-slate-700'>{t('ops.reconciliationsDetail.handoverHeading')}</h2>

          {handover ? (
            <div className='text-sm text-slate-700 space-y-1'>
              <div>
                <span className='text-slate-500'>{t('ops.reconciliationsDetail.handoverStatusLabel')} </span>
                {handover.status === 'CONFIRMED'
                  ? <span className='rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs'>{t('handoverStatus.confirmed')}</span>
                  : <span className='rounded bg-amber-100 text-amber-800 px-2 py-0.5 text-xs'>{t('handoverStatus.pending')}</span>}
              </div>
              <div><span className='text-slate-500'>{t('ops.reconciliationsDetail.handoverAmountLabel')} </span><span className='font-mono'>{handover.amount}</span></div>
              <div><span className='text-slate-500'>{t('ops.reconciliationsDetail.handoverToLabel')} </span>{userName(handover.toUserId)}</div>
              {handover.confirmedAt && (
                <div className='text-xs text-slate-500'>
                  {t('ops.reconciliationsDetail.confirmedAtPrefix')}{handover.confirmedAt}
                </div>
              )}
            </div>
          ) : isOwnerWaiter ? (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <div>
                  <label className='block'>
                    <span className='text-sm font-medium text-slate-700'>{t('form.receiver')}</span>
                    <select
                      className='mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white'
                      value={receiverId}
                      onChange={(e) => setReceiverId(e.target.value)}
                    >
                      <option value=''>{t('ops.reconciliationsDetail.selectReceiverPlaceholder')}</option>
                      {users
                        .filter((u) => u.role === 'MANAGER' || u.role === 'OWNER')
                        .map((u) => (
                          <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className='flex items-end pb-1'>
                  <div className='text-xs text-slate-500'>
                    {t('ops.reconciliationsDetail.amountDerived.before')}
                    <span className='font-mono'>{rec.actualCash}</span>
                    {t('ops.reconciliationsDetail.amountDerived.after')}
                  </div>
                </div>
              </div>
              <TextArea label={t('form.notesOptional')} value={handoverNotes} onChange={setHandoverNotes} rows={2} />
              <button
                type='button'
                onClick={createHandover}
                disabled={handoverBusy}
                className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
              >
                {handoverBusy ? t('ops.shiftsDetail.working') : t('action.createHandover')}
              </button>
            </>
          ) : (
            <div className='text-sm text-slate-600'>
              {t('ops.reconciliationsDetail.noHandoverYet')}
            </div>
          )}
        </div>
      )}
    </OpsShell>
  );
}
