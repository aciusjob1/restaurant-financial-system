'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { apiFetch } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';

type Shift = { id: string; businessDate: string; status: string };
type Collection = { id: string; shiftId: string; amount: string; voidedAt: string | null };
type Handover = { id: string; status: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CashHubPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [openShifts, setOpenShifts] = useState(0);
  const [todayTotal, setTodayTotal] = useState('0.00');
  const [pendingHandovers, setPendingHandovers] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = todayISO();
        const [shiftsRes, handoversRes] = await Promise.all([
          apiFetch<{ success: true; shifts: Shift[] }>(OPS_PATHS.shifts),
          apiFetch<{ success: true; handovers: Handover[] }>(OPS_PATHS.handovers),
        ]);
        if (cancelled) return;

        const open = shiftsRes.shifts.filter((s) => s.status !== 'CLOSED');
        const todayShiftIds = new Set(
          shiftsRes.shifts.filter((s) => s.businessDate === today).map((s) => s.id)
        );
        const pending = handoversRes.handovers.filter((h) => h.status === 'PENDING');

        setOpenShifts(open.length);
        setPendingHandovers(pending.length);

        if (todayShiftIds.size > 0) {
          const collRes = await apiFetch<{ success: true; collections: Collection[] }>(OPS_PATHS.collections);
          if (cancelled) return;
          const active = collRes.collections.filter(
            (c) => !c.voidedAt && todayShiftIds.has(c.shiftId)
          );
          const sum = active.reduce((acc, c) => acc + parseFloat(c.amount), 0);
          setTodayTotal(sum.toFixed(2));
        } else {
          setTodayTotal('0.00');
        }
      } catch {
        // best-effort; hub still renders
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ops = [
    { href: '/ops/cash/shift-flow', label: t('ops.cash.op.shiftFlow') },
    { href: '/ops/shifts',          label: t('ops.cash.op.shifts') },
    { href: '/ops/collections',     label: t('ops.cash.op.collections') },
    { href: '/ops/handovers',       label: t('ops.cash.op.handovers') },
    { href: '/ops/reconciliations', label: t('ops.cash.op.reconciliations') },
    { href: '/ops/daily-closing',   label: t('ops.cash.op.dailyClosing') },
  ];

  const nextAction = pendingHandovers > 0
    ? t('ops.cash.next.confirmHandover')
    : openShifts > 0
      ? t('ops.cash.next.reviewShifts')
      : t('ops.hub.allCaughtUp');

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.cash.title')}
        subtitle={t('ops.cash.subtitle')}
      />

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.status.heading')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.cash.stat.openShifts')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : openShifts}
            </div>
          </div>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.cash.stat.moneyCollected')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : todayTotal}
            </div>
          </div>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.cash.stat.pendingHandovers')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : pendingHandovers}
            </div>
          </div>
        </div>
      </section>

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.next.heading')}
        </h2>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700'>
          {loading ? t('ops.hub.loading') : nextAction}
        </div>
      </section>

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.operations.heading')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {ops.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className='rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm'
            >
              <div className='text-sm font-medium text-slate-900'>{o.label}</div>
            </Link>
          ))}
        </div>
      </section>
    </OpsShell>
  );
}
