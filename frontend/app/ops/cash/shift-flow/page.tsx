'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { FormError } from '@/components/ops/Form';
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

type User = { id: string; fullName: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type FlowState =
  | 'open'
  | 'awaiting_recon'
  | 'awaiting_review'
  | 'awaiting_handover'
  | 'awaiting_confirm'
  | 'ready_to_close'
  | 'closed';

function deriveState(
  shift: Shift,
  recon: Reconciliation | undefined,
  handover: Handover | undefined,
): FlowState {
  if (shift.status === 'CLOSED') return 'closed';
  if (shift.status === 'RECONCILING') return 'ready_to_close';
  if (!recon) {
    if (shift.status === 'OPEN') return 'open';
    return 'awaiting_recon';
  }
  if (recon.status === 'DRAFT') return 'awaiting_recon';
  if (recon.status === 'SUBMITTED') {
    if (!handover) return 'awaiting_review';
    if (handover.status === 'PENDING') return 'awaiting_confirm';
    return 'ready_to_close';
  }
  if (!handover) return 'awaiting_handover';
  if (handover.status === 'PENDING') return 'awaiting_confirm';
  return 'ready_to_close';
}

function stateKey(s: FlowState): keyof Dict {
  if (s === 'open') return 'ops.cashFlow.row.open';
  if (s === 'awaiting_recon') return 'ops.cashFlow.row.awaitingRecon';
  if (s === 'awaiting_review') return 'ops.cashFlow.row.awaitingReview';
  if (s === 'awaiting_handover') return 'ops.cashFlow.row.awaitingHandover';
  if (s === 'awaiting_confirm') return 'ops.cashFlow.row.awaitingConfirm';
  if (s === 'ready_to_close') return 'ops.cashFlow.row.readyToClose';
  return 'ops.cashFlow.row.closed';
}

function statePillClass(s: FlowState): string {
  if (s === 'closed') return 'bg-slate-100 text-slate-500';
  if (s === 'ready_to_close') return 'bg-emerald-100 text-emerald-700';
  if (s === 'awaiting_confirm' || s === 'awaiting_review') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}

function actionFor(s: FlowState): { key: keyof Dict; href: string } | null {
  if (s === 'open') return { key: 'ops.cashFlow.row.action.open', href: '/ops/shifts' };
  if (s === 'awaiting_recon') return { key: 'ops.cashFlow.row.action.open', href: '/ops/shifts' };
  if (s === 'awaiting_review') return { key: 'ops.cashFlow.row.action.review', href: '/ops/reconciliations' };
  if (s === 'awaiting_handover') return { key: 'ops.cashFlow.row.action.open', href: '/ops/handovers' };
  if (s === 'awaiting_confirm') return { key: 'ops.cashFlow.row.action.confirm', href: '/ops/handovers' };
  if (s === 'ready_to_close') return { key: 'ops.cashFlow.row.action.close', href: '/ops/shifts' };
  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4'>
      <div className='text-xs uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='mt-1 text-2xl font-mono text-slate-900'>{value}</div>
    </div>
  );
}

export default function ShiftFlowPage() {
  const { t, tError } = useT();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recons, setRecons] = useState<Reconciliation[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = todayISO();
        const [shiftsRes, collRes, recRes, hoRes, usersRes] = await Promise.all([
          apiFetch<{ success: true; shifts: Shift[] }>(OPS_PATHS.shifts),
          apiFetch<{ success: true; collections: Collection[] }>(OPS_PATHS.collections),
          apiFetch<{ success: true; reconciliations: Reconciliation[] }>(OPS_PATHS.reconciliations),
          apiFetch<{ success: true; handovers: Handover[] }>(OPS_PATHS.handovers),
          apiFetch<{ success: true; users: User[] }>('/api/v1/users').catch(() => ({ success: true as const, users: [] as User[] })),
        ]);
        if (cancelled) return;
        setShifts(shiftsRes.shifts.filter((s) => s.businessDate === today));
        setCollections(collRes.collections);
        setRecons(recRes.reconciliations);
        setHandovers(hoRes.handovers);
        setUsers(usersRes.users);
      } catch (e) {
        if (!cancelled && e instanceof ApiError) setErr({ code: e.code, message: e.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    return shifts.map((s) => {
      const coll = collections.filter((c) => c.shiftId === s.id && !c.voidedAt);
      const total = coll.reduce((acc, c) => acc + parseFloat(c.amount), 0);
      const recon = recons.find((r) => r.shiftId === s.id);
      const handover = recon ? handovers.find((h) => h.reconciliationId === recon.id) : undefined;
      const state = deriveState(s, recon, handover);
      const name =
        users.find((u) => u.id === s.userId)?.fullName ??
        (s.userId ? s.userId.slice(0, 8) : '\u2014');
      return { shift: s, total: total.toFixed(2), state, name };
    });
  }, [shifts, collections, recons, handovers, users]);

  const summary = useMemo(() => {
    let open = 0;
    let awaitingReview = 0;
    let awaitingConfirm = 0;
    let readyToClose = 0;
    for (const r of rows) {
      if (r.state === 'open' || r.state === 'awaiting_recon') open++;
      if (r.state === 'awaiting_review') awaitingReview++;
      if (r.state === 'awaiting_confirm') awaitingConfirm++;
      if (r.state === 'ready_to_close') readyToClose++;
    }
    return { open, awaitingReview, awaitingConfirm, readyToClose };
  }, [rows]);

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.cashFlow.title')}
        subtitle={t('ops.cashFlow.subtitle')}
      />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

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
                const action = actionFor(r.state);
                return (
                  <div
                    key={r.shift.id}
                    className='rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4'
                  >
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-3 flex-wrap'>
                        <span className='font-medium text-slate-900'>{r.name}</span>
                        <span
                          className={
                            'text-xs px-2 py-0.5 rounded-full ' + statePillClass(r.state)
                          }
                        >
                          {t(stateKey(r.state))}
                        </span>
                      </div>
                      <div className='mt-1 text-sm text-slate-600'>
                        {t('ops.cashFlow.row.collected')}:
                        {' '}
                        <span className='font-mono'>{r.total}</span>
                      </div>
                    </div>
                    {action && (
                      <Link
                        href={action.href}
                        className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 whitespace-nowrap'
                      >
                        {t(action.key)}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </OpsShell>
  );
}
