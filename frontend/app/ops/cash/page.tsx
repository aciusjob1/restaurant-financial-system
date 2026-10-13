'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DecimalField, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type ReceiptStatus = 'PENDING' | 'APPROVED' | 'INSUFFICIENT' | 'NO_NETCASH_HANDED_OVER';

type Receipt = {
  id: string;
  status: ReceiptStatus;
  amountReceived: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  userId: string;
  waiterName: string;
  businessDate: string;
  sales: string;
  mobileSales: string;
  otherSales: string;
  cashSales: string;
  collectedTotal: string;
  collectedCash: string;
  collectedMobile: string;
  collectedOther: string;
  expensesTotal: string;
  expectedNet: string;
  receipt: Receipt | null;
};

type Closing = { id: string; businessDate: string };
type InsufficientForm = { userId: string; amount: string } | null;

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function diffClass(n: number): string {
  if (Math.abs(n) < 0.005) return 'text-emerald-700';
  return n > 0 ? 'text-blue-700' : 'text-red-700';
}

function statusLabelKey(row: Row): keyof Dict {
  if (!row.receipt) return 'ops.cashFlow.row.awaitingSubmission';
  switch (row.receipt.status) {
    case 'PENDING': return 'ops.cashFlow.row.pendingReview';
    case 'APPROVED': return 'ops.cashFlow.row.approved';
    case 'INSUFFICIENT': return 'ops.cashFlow.row.insufficient';
    case 'NO_NETCASH_HANDED_OVER': return 'ops.cashFlow.row.noNetcash';
  }
}

function statusPillClass(row: Row): string {
  const base = 'text-xs px-2 py-0.5 rounded-full ';
  if (!row.receipt) return base + 'bg-slate-100 text-slate-600';
  switch (row.receipt.status) {
    case 'PENDING': return base + 'bg-amber-100 text-amber-800';
    case 'APPROVED': return base + 'bg-emerald-100 text-emerald-700';
    case 'INSUFFICIENT': return base + 'bg-red-100 text-red-800';
    case 'NO_NETCASH_HANDED_OVER': return base + 'bg-slate-100 text-slate-700';
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4'>
      <div className='text-xs uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='mt-1 text-2xl font-mono text-slate-900'>{value}</div>
    </div>
  );
}

export default function CashPage() {
  const { t, tError } = useT();
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [myRole, setMyRole] = useState('');
  const [todayClosing, setTodayClosing] = useState<Closing | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [closeDayConfirming, setCloseDayConfirming] = useState(false);
  const [insufficientForm, setInsufficientForm] = useState<InsufficientForm>(null);
  const [rowErr, setRowErr] = useState<{ userId: string; code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    const today = todayISO();
    Promise.all([
      apiFetch<{ success: true; rows: Row[] }>('/api/v1/daily-cash-receipts?businessDate=' + today),
      apiFetch<{ success: true; user: { role: string } }>('/api/v1/auth/me')
        .catch(() => ({ success: true as const, user: { role: '' } })),
      apiFetch<{ success: true; closings: Closing[] }>('/api/v1/daily-closings?businessDate=' + today)
        .catch(() => ({ success: true as const, closings: [] as Closing[] })),
    ])
      .then(([rRes, meRes, dRes]) => {
        setRows(rRes.rows);
        setMyRole(meRes.user.role);
        setTodayClosing(dRes.closings.length > 0 ? dRes.closings[0] : null);
      })
      .catch((e) => { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';

  const summary = useMemo(() => {
    let pending = 0, approved = 0, insufficient = 0, noNet = 0, awaitingSubmission = 0;
    for (const r of rows) {
      if (!r.receipt) awaitingSubmission++;
      else if (r.receipt.status === 'PENDING') pending++;
      else if (r.receipt.status === 'APPROVED') approved++;
      else if (r.receipt.status === 'INSUFFICIENT') insufficient++;
      else if (r.receipt.status === 'NO_NETCASH_HANDED_OVER') noNet++;
    }
    return { pending, approved, insufficient, noNet, awaitingSubmission };
  }, [rows]);

  const allClosed = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => r.receipt && r.receipt.status !== 'PENDING');
  }, [rows]);

  function clearAndReload(msg?: string) {
    if (msg) setFlash(msg);
    setInsufficientForm(null);
    setRowErr(null);
    load();
  }

  async function decide(row: Row, status: Exclude<ReceiptStatus, 'PENDING'>, amount: string | null) {
    if (!row.receipt) return;
    setErr(null); setRowErr(null);
    setBusyKey(row.userId);
    try {
      await apiFetch('/api/v1/daily-cash-receipts', {
        method: 'POST',
        body: JSON.stringify({
          userId: row.userId,
          businessDate: row.businessDate,
          status,
          amountReceived: amount,
          expectedUpdatedAt: row.receipt.updatedAt,
        }),
      });
      clearAndReload();
    } catch (e) {
      if (e instanceof ApiError) {
        setRowErr({ userId: row.userId, code: e.code, message: e.message });
      }
    } finally {
      setBusyKey(null);
    }
  }

  function approve(row: Row) { void decide(row, 'APPROVED', null); }
  function markNoNetcash(row: Row) { void decide(row, 'NO_NETCASH_HANDED_OVER', null); }
  function openInsufficientForm(row: Row) {
    setInsufficientForm({ userId: row.userId, amount: '' });
    setRowErr(null);
  }
  function submitInsufficient(row: Row) {
    if (!insufficientForm || insufficientForm.userId !== row.userId) return;
    const amount = insufficientForm.amount.trim();
    if (!amount) return;
    void decide(row, 'INSUFFICIENT', amount);
  }

  async function doCloseToday() {
    setErr(null); setBusyKey('day');
    try {
      await apiFetch('/api/v1/daily-closings', {
        method: 'POST', body: JSON.stringify({ businessDate: todayISO() }),
      });
      clearAndReload();
    } catch (e) {
      if (e instanceof ApiError) setErr({ code: e.code, message: e.message });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <OpsShell>
      <OpsHeader title={t('ops.cashFlow.title')} subtitle={t('ops.cashFlow.subtitle')} />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>{flash}</div>
      )}

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
        <>
          <section className='grid grid-cols-2 md:grid-cols-5 gap-3'>
            <Stat label={t('ops.cashFlow.summary.awaitingSubmission')} value={String(summary.awaitingSubmission)} />
            <Stat label={t('ops.cashFlow.summary.pendingReview')} value={String(summary.pending)} />
            <Stat label={t('ops.cashFlow.summary.approved')} value={String(summary.approved)} />
            <Stat label={t('ops.cashFlow.summary.insufficient')} value={String(summary.insufficient)} />
            <Stat label={t('ops.cashFlow.summary.noNetcash')} value={String(summary.noNet)} />
          </section>

          {rows.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500'>
              {t('ops.cashFlow.empty')}
            </div>
          ) : (
            <div className='space-y-3'>
              {rows.map((r) => {
                const exp = parseFloat(r.expectedNet) || 0;
                const recv = r.receipt?.amountReceived ? parseFloat(r.receipt.amountReceived) : null;
                const shortfall = recv !== null ? exp - recv : null;
                const isBusy = busyKey === r.userId;
                const isInsufficientFormOpen =
                  insufficientForm !== null && insufficientForm.userId === r.userId;
                const rowError = rowErr && rowErr.userId === r.userId ? rowErr : null;
                return (
                  <div key={r.userId} className='rounded-2xl border border-slate-200 bg-white p-4 space-y-3'>
                    <div className='flex items-start gap-4'>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-3 flex-wrap'>
                          <span className='font-medium text-slate-900'>{r.waiterName}</span>
                          <span className={statusPillClass(r)}>{t(statusLabelKey(r))}</span>
                          <span className='text-xs text-slate-500 font-mono'>{r.businessDate}</span>
                        </div>
                        <div className='mt-2 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1 text-sm'>
                          <div className='text-slate-600'>
                            {t('ops.cashFlow.row.sales')}: <span className='font-mono'>{r.sales}</span>
                          </div>
                          <div className='text-slate-600'>
                            {t('ops.cashFlow.row.mobile')}: <span className='font-mono'>{r.collectedMobile}</span>
                          </div>
                          <div className='text-slate-600'>
                            {t('ops.cashFlow.row.other')}: <span className='font-mono'>{r.collectedOther}</span>
                          </div>
                          <div className='text-slate-600'>
                            {t('ops.cashFlow.row.totalIn')}: <span className='font-mono'>{r.collectedTotal}</span>
                          </div>
                          <div className='text-slate-600'>
                            {t('table.expenses')}: <span className='font-mono'>{r.expensesTotal}</span>
                          </div>
                          <div className='text-slate-600 font-medium'>
                            {t('ops.cashFlow.row.expectedCash')}: <span className='font-mono'>{r.expectedNet}</span>
                          </div>
                        </div>
                        {recv !== null && (
                          <>
                            <div className='mt-1 text-sm text-slate-600'>
                              {t('ops.cashFlow.row.received')}: <span className='font-mono'>{r.receipt!.amountReceived}</span>
                            </div>
                            {shortfall !== null && Math.abs(shortfall) >= 0.005 && (
                              <div className={'mt-0.5 text-sm ' + diffClass(-shortfall)}>
                                {t('ops.cashFlow.row.shortfall')}: <span className='font-mono'>{shortfall.toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        )}
                        {r.receipt?.decidedAt && (
                          <div className='mt-1 text-xs text-slate-500'>
                            {t('ops.cashFlow.row.decidedAt')}: {r.receipt.decidedAt}
                          </div>
                        )}
                      </div>

                      {isManager && r.receipt && r.receipt.status === 'PENDING' && !isInsufficientFormOpen && (
                        <div className='flex gap-2 shrink-0'>
                          <button type='button' onClick={() => approve(r)} disabled={isBusy}
                            className='rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'>
                            {t('ops.cashFlow.row.action.approve')}
                          </button>
                          <button type='button' onClick={() => openInsufficientForm(r)} disabled={isBusy}
                            className='rounded-lg border border-red-300 text-red-800 px-3 py-1.5 text-sm disabled:opacity-60'>
                            {t('ops.cashFlow.row.action.insufficient')}
                          </button>
                          <button type='button' onClick={() => markNoNetcash(r)} disabled={isBusy}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'>
                            {t('ops.cashFlow.row.action.noNetcash')}
                          </button>
                        </div>
                      )}
                    </div>

                    {isInsufficientFormOpen && (
                      <div className='border-t border-slate-100 pt-3 space-y-2'>
                        <DecimalField
                          label={t('ops.cashFlow.row.insufficientPrompt')}
                          value={insufficientForm!.amount}
                          onChange={(v) => setInsufficientForm({ userId: r.userId, amount: v })}
                          placeholder='0.00'
                        />
                        <div className='flex gap-2 justify-end'>
                          <button
                            type='button'
                            onClick={() => setInsufficientForm(null)}
                            disabled={isBusy}
                            className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60'
                          >
                            {t('action.cancel')}
                          </button>
                          <button
                            type='button'
                            onClick={() => submitInsufficient(r)}
                            disabled={isBusy || insufficientForm!.amount.trim() === ''}
                            className='rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60'
                          >
                            {isBusy ? t('ops.shiftsDetail.working') : t('action.confirm')}
                          </button>
                        </div>
                      </div>
                    )}

                    {rowError && (
                      <div className='border-t border-slate-100 pt-3'>
                        <FormError code={rowError.code} message={tError(rowError.code, rowError.message)} />
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
                      className='rounded-lg border border-slate-300 px-4 py-2 text-sm'>{t('action.cancel')}</button>
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
    </OpsShell>
  );
}