'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DateField, SelectField, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

const STATUS_OPTIONS = ['ALL', 'CLOSED', 'SUPERSEDED', 'REOPENED'] as const;

type Closing = {
  id: string;
  businessDate: string;
  version: number;
  status: 'CLOSED' | 'SUPERSEDED' | 'REOPENED';
  salesSummaryTotal: string;
  expectedCash: string;
  actualCash: string;
  cashDifference: string;
  mobileDifference: string;
  shiftCount: number;
  pendingReviewCount: number;
  totalHandovers: number;
  pendingHandoverCount: number;
  closedBy: string;
  closedAt: string;
  reopenedAt: string | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function diffClass(v: string): string {
  const n = parseFloat(v);
  if (n === 0) return 'text-slate-500';
  return n > 0 ? 'text-emerald-700' : 'text-red-700';
}

function closingStatusKey(s: string): keyof Dict {
  if (s === 'CLOSED') return 'status.closed';
  if (s === 'REOPENED') return 'status.reopened';
  return 'status.superseded';
}

function closingStatusFilterKey(s: string): keyof Dict {
  if (s === 'ALL') return 'status.all';
  if (s === 'CLOSED') return 'status.closed';
  if (s === 'REOPENED') return 'status.reopened';
  return 'status.superseded';
}

function closingPillClass(s: string): string {
  if (s === 'CLOSED') return 'bg-emerald-100 text-emerald-700';
  if (s === 'REOPENED') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100';
}

export default function DailyClosingPage() {
  const { t, tError } = useT();
  const [closings, setClosings] = useState<Closing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState('');

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    if (filterDate) params.set('businessDate', filterDate);
    const qs = params.toString();
    apiFetch<{ success: true; closings: Closing[] }>('/api/v1/daily-closings' + (qs ? '?' + qs : ''))
      .then((r) => setClosings(r.closings))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filterStatus, filterDate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/daily-closings', {
        method: 'POST',
        body: JSON.stringify({ businessDate }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.dailyClosing.title')}
        subtitle={t('ops.dailyClosing.subtitle')}
      />

      <div className='flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4'>
        <div className='w-44'>
          <SelectField
            label={t('table.status')}
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: t(closingStatusFilterKey(s)) }))}
          />
        </div>
        <div className='w-48'>
          <DateField label={t('form.businessDate')} value={filterDate} onChange={setFilterDate} />
        </div>
      </div>

      <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.dailyClosing.closeHeading')}</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <DateField label={t('form.businessDate')} value={businessDate} onChange={setBusinessDate} required />
        </div>
        <div className='text-xs text-slate-500'>
          {t('ops.dailyClosing.note')}
        </div>
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <SubmitButton busy={busy}>{t('action.closeDay')}</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>{t('form.businessDate')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.ver')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.salesTotal')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.cashDiff')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.mobileDiff')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.shifts')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.pending')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.closedAt')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && closings.length === 0 && (
              <tr><td colSpan={10} className='px-3 py-6 text-center text-slate-400'>{t('ops.dailyClosing.empty')}</td></tr>
            )}
            {closings.map((c) => (
              <tr key={c.id} className='border-t border-slate-100'>
                <td className='px-3 py-2'>{c.businessDate}</td>
                <td className='px-3 py-2 text-slate-500'>v{c.version}</td>
                <td className='px-3 py-2'>
                  <span className={'text-xs rounded px-2 py-0.5 ' + closingPillClass(c.status)}>
                    {t(closingStatusKey(c.status))}
                  </span>
                </td>
                <td className='px-3 py-2 text-right font-mono'>{c.salesSummaryTotal}</td>
                <td className={'px-3 py-2 text-right font-mono ' + diffClass(c.cashDifference)}>{c.cashDifference}</td>
                <td className={'px-3 py-2 text-right font-mono ' + diffClass(c.mobileDifference)}>{c.mobileDifference}</td>
                <td className='px-3 py-2 text-right'>{c.shiftCount}</td>
                <td className={'px-3 py-2 text-right ' + (c.pendingReviewCount > 0 ? 'text-amber-700 font-medium' : '')}>{c.pendingReviewCount}</td>
                <td className='px-3 py-2 text-slate-500 text-xs'>{c.closedAt}</td>
                <td className='px-3 py-2'>
                  <Link
                    href={'/ops/daily-closing/' + c.id}
                    className='text-xs text-slate-700 underline hover:text-slate-900'
                  >
                    {t('action.open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
