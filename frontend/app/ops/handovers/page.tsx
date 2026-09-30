'use client';

import { useEffect, useState } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { SecondarySurfaceBanner } from '@/components/ops/SecondarySurfaceBanner';
import { SelectField, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'CONFIRMED'] as const;

type Handover = {
  id: string;
  reconciliationId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  status: 'PENDING' | 'CONFIRMED';
  handedOverAt: string;
  confirmedAt: string | null;
  notes: string | null;
  confirmedNotes: string | null;
};

type Reconciliation = { id: string; shiftId: string; userId: string };
type Shift = { id: string; businessDate: string };
type User = { id: string; fullName: string; username: string; role: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function HandoversPage() {
  const { t, tError } = useT();
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [recons, setRecons] = useState<Record<string, Reconciliation>>({});
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    const qs = params.toString();
    apiFetch<{ success: true; handovers: Handover[] }>('/api/v1/handovers' + (qs ? '?' + qs : ''))
      .then((r) => setHandovers(r.handovers))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; user: User }>('/api/v1/auth/me')
      .then((r) => setMyRole(r.user.role))
      .catch(() => {});
    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
    apiFetch<{ success: true; reconciliations: Reconciliation[] }>('/api/v1/reconciliations')
      .then((r) => {
        const map: Record<string, Reconciliation> = {};
        for (const x of r.reconciliations) map[x.id] = x;
        setRecons(map);
        const shiftIds = Array.from(new Set(r.reconciliations.map((x) => x.shiftId)));
        return Promise.all(
          shiftIds.map((sid) =>
            apiFetch<{ success: true; shift: Shift }>('/api/v1/shifts/' + sid)
              .then((s) => s.shift)
              .catch(() => null)
          )
        );
      })
      .then((shiftsArr) => {
        if (!shiftsArr) return;
        const map: Record<string, Shift> = {};
        for (const s of shiftsArr) if (s) map[s.id] = s;
        setShifts(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterStatus]);

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  function businessDate(h: Handover): string {
    const rec = recons[h.reconciliationId];
    if (!rec) return h.reconciliationId.slice(0, 8) + '\u2026';
    const sh = shifts[rec.shiftId];
    return sh ? sh.businessDate : rec.shiftId.slice(0, 8) + '\u2026';
  }

  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';

  async function confirm(id: string) {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/handovers/' + id + '/confirm', {
        method: 'POST',
        body: JSON.stringify({
          confirmedNotes: confirmNotes.trim() === '' ? undefined : confirmNotes.trim(),
        }),
      });
      setConfirmId(null);
      setConfirmNotes('');
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
        title={t('ops.handovers.title')}
        subtitle={t('ops.handovers.subtitle')}
      />
      <SecondarySurfaceBanner />

      <div className='rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3'>
        <div className='w-48'>
          <SelectField
            label={t('table.status')}
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({
              value: s,
              label: s === 'ALL'
                ? t('status.all')
                : s === 'PENDING'
                  ? t('handoverStatus.pending')
                  : t('handoverStatus.confirmed'),
            }))}
          />
        </div>
      </div>

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>{t('form.businessDate')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.from')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.to')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.amount')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.handedOver')}</th>
              <th className='text-left px-3 py-2 font-medium w-48'>{t('table.action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && handovers.length === 0 && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('ops.handovers.empty')}</td></tr>
            )}
            {handovers.map((h) => (
              <tr key={h.id} className='border-t border-slate-100'>
                <td className='px-3 py-2'>{businessDate(h)}</td>
                <td className='px-3 py-2'>{userName(h.fromUserId)}</td>
                <td className='px-3 py-2'>{userName(h.toUserId)}</td>
                <td className='px-3 py-2 text-right font-mono'>{h.amount}</td>
                <td className='px-3 py-2'>
                  {h.status === 'CONFIRMED'
                    ? <span className='text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5'>{t('handoverStatus.confirmed')}</span>
                    : <span className='text-xs rounded bg-amber-100 text-amber-800 px-2 py-0.5'>{t('handoverStatus.pending')}</span>}
                </td>
                <td className='px-3 py-2 text-slate-500 text-xs'>{h.handedOverAt}</td>
                <td className='px-3 py-2'>
                  {h.status === 'PENDING' && isManager && (
                    confirmId === h.id ? (
                      <div className='space-y-1'>
                        <input
                          className='w-full rounded border border-slate-300 px-2 py-1 text-xs'
                          placeholder={t('ops.handovers.confirmNotesPlaceholder')}
                          value={confirmNotes}
                          onChange={(e) => setConfirmNotes(e.target.value)}
                        />
                        <div className='flex gap-1 justify-end'>
                          <button
                            type='button'
                            onClick={() => confirm(h.id)}
                            disabled={busy}
                            className='text-xs rounded bg-emerald-600 text-white px-2 py-1 disabled:opacity-60'
                          >
                            {busy ? t('ops.shiftsDetail.working') : t('action.confirm')}
                          </button>
                          <button
                            type='button'
                            onClick={() => { setConfirmId(null); setConfirmNotes(''); }}
                            className='text-xs text-slate-600'
                          >
                            {t('action.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type='button'
                        onClick={() => { setConfirmId(h.id); setConfirmNotes(''); }}
                        className='text-xs text-emerald-700 underline hover:text-emerald-900'
                      >
                        {t('ops.handovers.confirmReceipt')}
                      </button>
                    )
                  )}
                  {h.status === 'CONFIRMED' && h.confirmedNotes && (
                    <span className='text-xs text-slate-500'>{h.confirmedNotes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
