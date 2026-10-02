'use client';

import { useEffect, useState } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { FormError } from '@/components/ops/Form';
import { apiFetch, ApiError, API_BASE } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';

type BackupFile = {
  filename: string;
  path: string;
  sizeBytes: number;
  generatedAt: string | null;
  rowCount: number | null;
};

type BackupListResponse = {
  success: true;
  destination: string;
  backups: BackupFile[];
};

type BackupCreateResponse = {
  success: true;
  backup: BackupFile;
};

type MeResponse = {
  success: true;
  user: { id: string; role: string };
};

type Destination = {
  path: string;
  label: string;
  kind: 'local' | 'cloud';
  exists: boolean;
};

type DestinationsResponse = {
  success: true;
  destinations: Destination[];
  current: string;
};

type ScheduleResponse = {
  success: true;
  schedule: {
    cron: string;
    preset: string;
    retention: string;
    lastRunAt: string;
    lastRunStatus: string;
    lastRunMessage: string;
  };
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

const PRESET_KEYS = ['off', 'daily', 'weekly', 'monthly', 'custom'] as const;
type PresetKey = (typeof PRESET_KEYS)[number];

const PRESET_LABEL = {
  off: 'ops.settings.backup.preset.off',
  daily: 'ops.settings.backup.preset.daily',
  weekly: 'ops.settings.backup.preset.weekly',
  monthly: 'ops.settings.backup.preset.monthly',
  custom: 'ops.settings.backup.preset.custom',
} as const;

function presetToCron(preset: string, custom: string): string {
  if (preset === 'off') return '';
  if (preset === 'daily') return '0 23 * * *';
  if (preset === 'weekly') return '0 23 * * 0';
  if (preset === 'monthly') return '0 23 1 * *';
  return custom;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function BackupSettingsPage() {
  const { t, tError } = useT();
  const [destination, setDestination] = useState('');
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [currentDest, setCurrentDest] = useState('');
  const [schedule, setSchedule] = useState<ScheduleResponse['schedule'] | null>(null);
  const [preset, setPreset] = useState('off');
  const [cronExpr, setCronExpr] = useState('');
  const [retention, setRetention] = useState('0');
  const [customPath, setCustomPath] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState('');
  const [restoreReason, setRestoreReason] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');

  function load() {
    setLoading(true);
    setErr(null);
    Promise.all([
      apiFetch<BackupListResponse>(OPS_PATHS.backups),
      apiFetch<MeResponse>('/api/v1/auth/me'),
      apiFetch<DestinationsResponse>(OPS_PATHS.backups + '/destinations'),
      apiFetch<ScheduleResponse>(OPS_PATHS.backups + '/schedule'),
    ])
      .then(([listRes, meRes, destRes, schedRes]) => {
        setDestination(listRes.destination);
        setBackups(listRes.backups);
        setCanWrite(meRes.user.role === 'OWNER');
        setDestinations(destRes.destinations);
        setCurrentDest(destRes.current);
        setSchedule(schedRes.schedule);
        setPreset(schedRes.schedule.preset || 'off');
        setCronExpr(schedRes.schedule.cron);
        setRetention(schedRes.schedule.retention || '0');
      })
      .catch((e) => { if (e instanceof ApiError) setErr({ code: e.code, message: e.message }); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function createNow() {
    setBusy(true); setErr(null); setFlash(null);
    try {
      const res = await apiFetch<BackupCreateResponse>(OPS_PATHS.backups, {
        method: 'POST',
      });
      setFlash(t('ops.settings.backup.done').replace('{name}', res.backup.filename));
      load();
    } catch (e) {
      if (e instanceof ApiError) setErr({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveDestination() {
    setBusy(true); setErr(null); setFlash(null);
    try {
      const chosen = customPath.trim() || currentDest;
      await apiFetch(OPS_PATHS.backups + '/destination', {
        method: 'POST',
        body: JSON.stringify({ destination: chosen }),
      });
      setFlash(t('ops.settings.backup.destSaved'));
      load();
    } catch (e) {
      if (e instanceof ApiError) setErr({ code: e.code, message: e.message });
    } finally { setBusy(false); }
  }

  async function saveSchedule() {
    setBusy(true); setErr(null); setFlash(null);
    try {
      const cron = presetToCron(preset, cronExpr);
      await apiFetch(OPS_PATHS.backups + '/schedule', {
        method: 'POST',
        body: JSON.stringify({ cron, preset, retention }),
      });
      setFlash(t('ops.settings.backup.schedSaved'));
      load();
    } catch (e) {
      if (e instanceof ApiError) setErr({ code: e.code, message: e.message });
    } finally { setBusy(false); }
  }

  function openRestore(filename: string) {
    setRestoreOpen(true);
    setRestoreFile(filename);
    setRestoreReason('');
    setRestoreConfirm('');
    setErr(null); setFlash(null);
  }

  async function doRestore() {
    if (restoreConfirm !== 'RESTORE') {
      setErr({ code: 'CONFIRM', message: t('ops.settings.backup.restoreConfirmHint') });
      return;
    }
    if (restoreReason.trim().length < 5) {
      setErr({ code: 'REASON', message: t('ops.settings.backup.restoreReasonHint') });
      return;
    }
    setBusy(true); setErr(null); setFlash(null);
    try {
      const res = await apiFetch<{ success: true; result: { rowCount: number; preRestoreBackup: string } }>(
        OPS_PATHS.backups + '/' + encodeURIComponent(restoreFile) + '/restore',
        {
          method: 'POST',
          body: JSON.stringify({ confirm: 'RESTORE', reason: restoreReason.trim() }),
        }
      );
      setFlash(t('ops.settings.backup.restoreDone')
        .replace('{rows}', String(res.result.rowCount))
        .replace('{pre}', res.result.preRestoreBackup));
      setRestoreOpen(false);
      load();
    } catch (e) {
      if (e instanceof ApiError) setErr({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.settings.backup.title')}
        subtitle={t('ops.settings.backup.subtitle')}
      />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>{flash}</div>
      )}

      <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.settings.backup.nowHeading')}</h2>
        <p className='text-xs text-slate-500'>
          {t('ops.settings.backup.destination')}: <span className='font-mono'>{destination}</span>
        </p>
        {canWrite && (
          <button
            type='button'
            onClick={createNow}
            disabled={busy}
            className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
          >
            {busy ? t('ops.settings.backup.running') : t('ops.settings.backup.nowButton')}
          </button>
        )}
      </section>

      <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.settings.backup.listHeading')}</h2>
        {loading ? (
          <div className='text-sm text-slate-400'>{t('common.loading')}</div>
        ) : backups.length === 0 ? (
          <div className='text-sm text-slate-500'>{t('ops.settings.backup.empty')}</div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50 text-slate-600'>
                <tr>
                  <th className='text-left px-3 py-2 font-medium'>{t('ops.settings.backup.colFile')}</th>
                  <th className='text-left px-3 py-2 font-medium'>{t('ops.settings.backup.colGenerated')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.settings.backup.colRows')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.settings.backup.colSize')}</th>
                  <th className='text-right px-3 py-2 font-medium'>{t('ops.settings.backup.colAction')}</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {backups.map((b) => (
                  <tr key={b.filename}>
                    <td className='px-3 py-2 font-mono text-xs text-slate-700'>{b.filename}</td>
                    <td className='px-3 py-2 text-slate-600'>{formatWhen(b.generatedAt)}</td>
                    <td className='px-3 py-2 text-right font-mono text-slate-600'>{b.rowCount ?? '\u2014'}</td>
                    <td className='px-3 py-2 text-right font-mono text-slate-600'>{formatSize(b.sizeBytes)}</td>
                    <td className='px-3 py-2 text-right text-xs space-x-3 whitespace-nowrap'>
                      <a
                        href={API_BASE + OPS_PATHS.backups + '/' + encodeURIComponent(b.filename) + '/download'}
                        className='text-blue-600 hover:text-blue-700'
                      >
                        {t('ops.settings.backup.actionDownload')}
                      </a>
                      {canWrite && (
                        <button
                          type='button'
                          onClick={() => openRestore(b.filename)}
                          className='text-red-600 hover:text-red-700'
                        >
                          {t('ops.settings.backup.actionRestore')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.settings.backup.destHeading')}</h2>
        <select
          className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
          value={currentDest}
          onChange={(e) => setCurrentDest(e.target.value)}
          disabled={!canWrite}
        >
          <option value=''>{t('ops.settings.backup.destDefault')}</option>
          {destinations.map((d) => (
            <option key={d.path} value={d.path}>{d.label} — {d.path}</option>
          ))}
        </select>
        <input
          type='text'
          placeholder={t('ops.settings.backup.destCustom')}
          value={customPath}
          onChange={(e) => setCustomPath(e.target.value)}
          disabled={!canWrite}
          className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono'
        />
        {canWrite && (
          <button
            type='button'
            onClick={saveDestination}
            disabled={busy}
            className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
          >
            {t('ops.settings.backup.destSave')}
          </button>
        )}
      </section>

      <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.settings.backup.schedHeading')}</h2>
        <div className='flex flex-wrap gap-4 text-sm'>
          {PRESET_KEYS.map((p) => (
            <label key={p} className='flex items-center gap-2'>
              <input
                type='radio'
                name='preset'
                value={p}
                checked={preset === p}
                onChange={() => setPreset(p)}
                disabled={!canWrite}
              />
              <span>{t(PRESET_LABEL[p])}</span>
            </label>
          ))}
        </div>
        {preset === 'custom' && (
          <input
            type='text'
            placeholder='0 23 * * *'
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            disabled={!canWrite}
            className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono'
          />
        )}
        <div className='flex items-center gap-3 text-sm'>
          <label>{t('ops.settings.backup.retentionLabel')}</label>
          <input
            type='number'
            min='0'
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            disabled={!canWrite}
            className='w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm'
          />
        </div>
        {canWrite && (
          <button
            type='button'
            onClick={saveSchedule}
            disabled={busy}
            className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
          >
            {t('ops.settings.backup.schedSave')}
          </button>
        )}
      </section>

      <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-2'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.settings.backup.lastAuto')}</h2>
        {schedule && schedule.lastRunAt ? (
          <div className='text-sm text-slate-600 space-y-1'>
            <div>{formatWhen(schedule.lastRunAt)} — {schedule.lastRunStatus}</div>
            {schedule.lastRunMessage && (
              <div className='text-xs text-red-600 font-mono'>{schedule.lastRunMessage}</div>
            )}
          </div>
        ) : (
          <div className='text-sm text-slate-500'>{t('ops.settings.backup.never')}</div>
        )}
      </section>

      {restoreOpen && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4'>
            <h3 className='text-lg font-medium text-red-700'>{t('ops.settings.backup.restoreTitle')}</h3>
            <p className='text-sm text-slate-600'>
              {t('ops.settings.backup.restoreBody').replace('{name}', restoreFile)}
            </p>
            <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800'>
              {t('ops.settings.backup.restoreWarning')}
            </div>
            <input
              type='text'
              placeholder={t('ops.settings.backup.restoreReason')}
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
            />
            <input
              type='text'
              placeholder={t('ops.settings.backup.restoreType')}
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono'
            />
            <div className='flex justify-end gap-2 pt-2'>
              <button
                type='button'
                onClick={() => setRestoreOpen(false)}
                disabled={busy}
                className='rounded-lg border border-slate-300 px-4 py-2 text-sm'
              >
                {t('ops.settings.backup.cancel')}
              </button>
              <button
                type='button'
                onClick={doRestore}
                disabled={busy || restoreConfirm !== 'RESTORE' || restoreReason.trim().length < 5}
                className='rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
              >
                {busy ? t('ops.settings.backup.restoreRunning') : t('ops.settings.backup.restoreButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </OpsShell>
  );
}
