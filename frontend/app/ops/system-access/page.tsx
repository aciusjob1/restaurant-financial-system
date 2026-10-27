'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Candidate = {
  address: string;
  iface: string;
  private: boolean;
  likelyVirtual: boolean;
};

type AccessResponse = {
  candidates: Candidate[];
  confident: boolean;
};

type Status = 'checking' | 'connected' | 'unavailable' | 'signedout' | 'forbidden' | 'error';

type DeviceUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
};

type DeviceSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  expiresAt: string;
  createdAt: string;
  user: DeviceUser;
};

type Device = {
  id: string;
  name: string;
  status: 'ALLOWED' | 'BLOCKED';
  platform: string | null;
  userAgent: string | null;
  lastIp: string | null;
  lastSeenAt: string | null;
  lastUserId: string | null;
  blockedAt: string | null;
  blockedBy: string | null;
  blockReason: string | null;
  createdAt: string;
  updatedAt: string;
  sessions: DeviceSession[];
  activeUsers: DeviceUser[];
};

type DevicesResponse = {
  success: true;
  devices: Device[];
  unregisteredSessions: DeviceSession[];
};

type MeInfo = {
  role: string;
  sessionId: string | null;
  deviceId: string | null;
};

function formatWhen(value: string | null): string {
  if (!value) return '\u2014';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '\u2014' : d.toLocaleString();
}

function shortUa(value: string | null): string {
  if (!value) return '\u2014';
  return value.length > 64 ? value.slice(0, 64) + '\u2026' : value;
}

export default function SystemAccessPage() {
  const { t, tError } = useT();
  const [status, setStatus] = useState<Status>('checking');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confident, setConfident] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [unregistered, setUnregistered] = useState<DeviceSession[]>([]);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [deviceErr, setDeviceErr] = useState<{ code: string; message: string } | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');

  const [blockAllConfirming, setBlockAllConfirming] = useState(false);
  const [blockAllReason, setBlockAllReason] = useState('');
  const [busyBlockAll, setBusyBlockAll] = useState(false);
  const [blockAllResult, setBlockAllResult] = useState<{
    blockedDevices: number;
    revokedSessions: number;
  } | null>(null);

  const [allowAllConfirming, setAllowAllConfirming] = useState(false);
  const [busyAllowAll, setBusyAllowAll] = useState(false);
  const [allowAllResult, setAllowAllResult] = useState<{ allowedDevices: number } | null>(null);

  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const webPort = typeof window !== 'undefined' ? window.location.port : '3000';

  const check = useCallback(async () => {
    setStatus('checking');
    setCopied(false);
    setCopyFailed(false);

    try {
      const health = await fetch('/health', { cache: 'no-store' });
      if (!health.ok) { setStatus('unavailable'); return; }
    } catch {
      setStatus('unavailable');
      return;
    }

    try {
      const res = await apiFetch<AccessResponse>('/api/v1/system/access');
      if (!res || !Array.isArray(res.candidates) || typeof res.confident !== 'boolean') {
        setStatus('error');
        return;
      }
      setCandidates(res.candidates);
      setConfident(res.confident);
      setStatus('connected');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) { setStatus('signedout'); return; }
        if (err.status === 403) { setStatus('forbidden'); return; }
        setStatus('error');
        return;
      }
      setStatus('unavailable');
    }
  }, []);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDeviceErr(null);
    try {
      const [res, meRes] = await Promise.all([
        apiFetch<DevicesResponse>('/api/v1/system/devices'),
        apiFetch<{ success: true; user: MeInfo }>('/api/v1/auth/me'),
      ]);
      setDevices(
        [...res.devices].sort((a, b) => {
          const ta = a.lastSeenAt ? Date.parse(a.lastSeenAt) : Number.NEGATIVE_INFINITY;
          const tb = b.lastSeenAt ? Date.parse(b.lastSeenAt) : Number.NEGATIVE_INFINITY;
          return tb - ta;
        })
      );
      setUnregistered(res.unregisteredSessions);
      setMe({
        role: meRes.user.role,
        sessionId: meRes.user.sessionId ?? null,
        deviceId: meRes.user.deviceId ?? null,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setDeviceErr({ code: err.code, message: err.message });
      } else {
        setDeviceErr({ code: 'ERR', message: 'Unable to load connected devices.' });
      }
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);
  useEffect(() => { void loadDevices(); }, [loadDevices]);

  // Keep the list current so a device that just started using the system
  // moves to the top without a manual reload. Also refresh on tab focus.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadDevices();
    }, 30_000);
    const onFocus = () => { void loadDevices(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadDevices]);

  const primary = candidates.find((c) => !c.likelyVirtual) ?? candidates[0];
  const url = primary ? protocol + '//' + primary.address + (webPort ? ':' + webPort : '') : '';
  const blockedDeviceCount = devices.filter((d) => d.status === 'BLOCKED').length;

  async function copy() {
    if (!url) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  async function actOnDevice(
    deviceId: string,
    action: () => Promise<unknown>
  ) {
    setBusyDeviceId(deviceId);
    setDeviceErr(null);
    try {
      await action();
      setRenamingId(null);
      setBlockingId(null);
      setBlockReason('');
      await loadDevices();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeviceErr({ code: err.code, message: err.message });
      } else {
        setDeviceErr({ code: 'ERR', message: 'The action could not be completed.' });
      }
    } finally {
      setBusyDeviceId(null);
    }
  }

  function saveRename(device: Device) {
    const name = renameValue.trim();
    if (!name) return;
    void actOnDevice(device.id, () =>
      apiFetch('/api/v1/system/devices/' + device.id, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
    );
  }

  function setAccess(device: Device, accessStatus: 'ALLOWED' | 'BLOCKED') {
    const reason = blockReason.trim();
    void actOnDevice(device.id, () =>
      apiFetch('/api/v1/system/devices/' + device.id + '/access', {
        method: 'POST',
        body: JSON.stringify({
          status: accessStatus,
          ...(reason.length >= 3 ? { reason } : {}),
        }),
      })
    );
  }

  async function signOutSession(sessionId: string) {
    setBusySessionId(sessionId);
    setDeviceErr(null);
    try {
      await apiFetch('/api/v1/system/sessions/' + sessionId + '/revoke', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadDevices();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeviceErr({ code: err.code, message: err.message });
      } else {
        setDeviceErr({ code: 'ERR', message: 'The session could not be signed out.' });
      }
    } finally {
      setBusySessionId(null);
    }
  }

  async function blockAll() {
    setBusyBlockAll(true);
    setDeviceErr(null);
    setBlockAllResult(null);
    try {
      const reason = blockAllReason.trim();
      const res = await apiFetch<{
        success: true;
        blockedDevices: number;
        revokedSessions: number;
      }>('/api/v1/system/devices/block-all', {
        method: 'POST',
        body: JSON.stringify(reason.length >= 3 ? { reason } : {}),
      });
      setBlockAllResult({
        blockedDevices: res.blockedDevices,
        revokedSessions: res.revokedSessions,
      });
      setBlockAllConfirming(false);
      setBlockAllReason('');
      await loadDevices();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeviceErr({ code: err.code, message: err.message });
      } else {
        setDeviceErr({ code: 'ERR', message: 'Devices could not be blocked.' });
      }
    } finally {
      setBusyBlockAll(false);
    }
  }

  async function allowAll() {
    setBusyAllowAll(true);
    setDeviceErr(null);
    setAllowAllResult(null);
    try {
      const res = await apiFetch<{ success: true; allowedDevices: number }>(
        '/api/v1/system/devices/allow-all',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setAllowAllResult({ allowedDevices: res.allowedDevices });
      setAllowAllConfirming(false);
      await loadDevices();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeviceErr({ code: err.code, message: err.message });
      } else {
        setDeviceErr({ code: 'ERR', message: 'Devices could not be restored.' });
      }
    } finally {
      setBusyAllowAll(false);
    }
  }

  const statusLabel = status === 'connected' ? 'ops.systemAccess.connected'
    : status === 'unavailable' ? 'ops.systemAccess.unavailable'
    : status === 'signedout' ? 'ops.systemAccess.sessionExpiredLabel'
    : status === 'forbidden' ? 'ops.systemAccess.permissionDeniedLabel'
    : status === 'error' ? 'ops.systemAccess.error'
    : 'ops.systemAccess.checking';

  function renderSession(s: DeviceSession) {
    const isCurrent = s.id === me?.sessionId;
    const canRevoke = me?.role === 'OWNER' || s.user.role !== 'OWNER';
    return (
      <div key={s.id} className='flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2'>
        <div className='min-w-0 text-xs'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <span className='font-medium text-slate-700'>{s.user.fullName}</span>
            <span className='text-slate-400'>@{s.user.username}</span>
            <span className='rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600'>{s.user.role}</span>
            {isCurrent && (
              <span className='rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700'>
                {t('ops.systemAccess.deviceCurrent')}
              </span>
            )}
          </div>
          <div className='mt-1 text-slate-500'>
            {formatWhen(s.lastSeenAt)} &middot; {s.ipAddress ?? '\u2014'} &middot;{' '}
            <span title={s.userAgent ?? ''}>{shortUa(s.userAgent)}</span>
          </div>
        </div>
        {canRevoke && !isCurrent && (
          <button
            type='button'
            onClick={() => void signOutSession(s.id)}
            disabled={busySessionId === s.id}
            className='rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60'
          >
            {t('ops.systemAccess.deviceSignOut')}
          </button>
        )}
      </div>
    );
  }

  return (
    <OpsShell>
      <div className='space-y-4'>
        <OpsHeader title={t('ops.systemAccess.title')} subtitle={t('ops.systemAccess.subtitle')} />

        <div className='max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <div className='text-xs uppercase tracking-wide text-slate-500'>{t('ops.systemAccess.label')}</div>

          <div className='flex items-center gap-2'>
            <span className={
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ' +
              (status === 'connected'
                ? 'bg-emerald-50 text-emerald-700'
                : status === 'checking'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-red-50 text-red-700')
            }>
              <span className={
                'h-1.5 w-1.5 rounded-full ' +
                (status === 'connected'
                  ? 'bg-emerald-500'
                  : status === 'checking'
                  ? 'bg-slate-400'
                  : 'bg-red-500')
              } />
              {t(statusLabel)}
            </span>
            <button type='button' onClick={() => void check()} className='rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50'>
              {t('ops.systemAccess.retry')}
            </button>
          </div>

          {status === 'signedout' && <p className='text-sm text-red-700'>{t('ops.systemAccess.signedout')}</p>}
          {status === 'forbidden' && <p className='text-sm text-red-700'>{t('ops.systemAccess.forbidden')}</p>}
          {status === 'unavailable' && <p className='text-sm text-red-700'>{t('ops.systemAccess.unavailableBody')}</p>}
          {status === 'error' && <p className='text-sm text-red-700'>{t('ops.systemAccess.errorBody')}</p>}

          {status === 'connected' && url && (
            <>
              <div className='flex items-center gap-2'>
                <code className='flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm'>{url}</code>
                <button type='button' onClick={() => void copy()} className='rounded-lg bg-slate-900 px-3 py-2 text-sm text-white'>
                  {copied ? t('ops.systemAccess.copied') : t('ops.systemAccess.copy')}
                </button>
              </div>
              {copyFailed && <p className='text-sm text-red-700'>{t('ops.systemAccess.copyFailed')}</p>}

              {!confident && (
                <div className='space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
                  <p className='font-medium'>{t('ops.systemAccess.ambiguousTitle')}</p>
                  <p>{t('ops.systemAccess.ambiguousBody')}</p>
                  {candidates.length > 0 && (
                    <ul className='space-y-1'>
                      {candidates.map((c) => (
                        <li key={c.iface + '-' + c.address} className='break-all font-mono text-xs'>
                          {protocol + '//' + c.address + (webPort ? ':' + webPort : '')} <span className='text-amber-700'>({c.iface})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className='text-sm text-slate-600'>
                <p className='font-medium text-slate-700'>{t('ops.systemAccess.howTitle')}</p>
                <ol className='mt-1 list-decimal space-y-0.5 pl-5'>
                  <li>{t('ops.systemAccess.how1')}</li>
                  <li>{t('ops.systemAccess.how2')}</li>
                  <li>{t('ops.systemAccess.how3')}</li>
                </ol>
              </div>
            </>
          )}

          {status === 'connected' && !url && <p className='text-sm text-slate-600'>{t('ops.systemAccess.noAddress')}</p>}
        </div>

        <div className='max-w-4xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5'>
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <div>
              <h2 className='text-sm font-semibold text-slate-800'>{t('ops.systemAccess.devicesTitle')}</h2>
              <p className='text-xs text-slate-500'>{t('ops.systemAccess.devicesSubtitle')}</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {me?.role === 'OWNER' && (
                <button
                  type='button'
                  onClick={() => {
                    setBlockAllConfirming((v) => !v);
                    setBlockAllResult(null);
                  }}
                  disabled={busyBlockAll}
                  className='rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60'
                >
                  {t('ops.systemAccess.blockAll')}
                </button>
              )}
              {me?.role === 'OWNER' && (
                <button
                  type='button'
                  onClick={() => {
                    setAllowAllConfirming((v) => !v);
                    setAllowAllResult(null);
                  }}
                  disabled={busyAllowAll || blockedDeviceCount === 0}
                  className='rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60'
                >
                  {t('ops.systemAccess.allowAll')}
                  {blockedDeviceCount > 0 ? ' (' + blockedDeviceCount + ')' : ''}
                </button>
              )}
              <button
                type='button'
                onClick={() => void loadDevices()}
                disabled={devicesLoading}
                className='rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-60'
              >
                {t('ops.systemAccess.devicesRefresh')}
              </button>
            </div>
          </div>

          {me?.role === 'OWNER' && blockAllConfirming && (
            <div className='space-y-2 rounded-xl border border-red-200 bg-red-50 p-3'>
              <p className='text-sm text-red-800'>{t('ops.systemAccess.blockAllWarning')}</p>
              <input
                className='w-full rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm'
                value={blockAllReason}
                maxLength={200}
                onChange={(e) => setBlockAllReason(e.target.value)}
                placeholder={t('ops.systemAccess.blockAllReason')}
              />
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={() => void blockAll()}
                  disabled={busyBlockAll}
                  className='rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60'
                >
                  {busyBlockAll
                    ? t('ops.systemAccess.blockAllWorking')
                    : t('ops.systemAccess.blockAllConfirm')}
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setBlockAllConfirming(false);
                    setBlockAllReason('');
                  }}
                  disabled={busyBlockAll}
                  className='text-xs text-slate-700'
                >
                  {t('action.cancel')}
                </button>
              </div>
            </div>
          )}

          {me?.role === 'OWNER' && allowAllConfirming && (
            <div className='space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3'>
              <p className='text-sm text-emerald-900'>{t('ops.systemAccess.allowAllWarning')}</p>
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={() => void allowAll()}
                  disabled={busyAllowAll}
                  className='rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60'
                >
                  {busyAllowAll
                    ? t('ops.systemAccess.allowAllWorking')
                    : t('ops.systemAccess.allowAllConfirm')}
                </button>
                <button
                  type='button'
                  onClick={() => setAllowAllConfirming(false)}
                  disabled={busyAllowAll}
                  className='text-xs text-slate-700'
                >
                  {t('action.cancel')}
                </button>
              </div>
            </div>
          )}

          {blockAllResult && (
            <div className='rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
              <strong>{blockAllResult.blockedDevices}</strong>{' '}
              {t('ops.systemAccess.blockAllDoneDevices')},{' '}
              <strong>{blockAllResult.revokedSessions}</strong>{' '}
              {t('ops.systemAccess.blockAllDoneSessions')}.{' '}
              {t('ops.systemAccess.blockAllDoneTail')}
            </div>
          )}

          {allowAllResult && (
            <div className='rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
              <strong>{allowAllResult.allowedDevices}</strong>{' '}
              {t('ops.systemAccess.allowAllDoneDevices')}.{' '}
              {t('ops.systemAccess.allowAllDoneTail')}
            </div>
          )}

          {deviceErr && <FormError code={deviceErr.code} message={tError(deviceErr.code, deviceErr.message)} />}
          {devicesLoading && devices.length === 0 && (
            <div className='text-sm text-slate-400'>{t('common.loading')}</div>
          )}
          {!devicesLoading && devices.length === 0 && (
            <div className='text-sm text-slate-400'>{t('ops.systemAccess.devicesEmpty')}</div>
          )}

          <div className='space-y-3'>
            {devices.map((device) => {
              const isCurrent = device.id === me?.deviceId;
              const busy = busyDeviceId === device.id;
              const managerCannotBlock =
                me?.role !== 'OWNER' && device.activeUsers.some((u) => u.role === 'OWNER');
              return (
                <div key={device.id} className='rounded-xl border border-slate-200 p-4 space-y-3'>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium text-slate-800'>
                          {device.name || t('ops.systemAccess.deviceUnknown')}
                        </span>
                        <span className={
                          'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
                          (device.status === 'ALLOWED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700')
                        }>
                          {device.status === 'ALLOWED'
                            ? t('ops.systemAccess.deviceStatusAllowed')
                            : t('ops.systemAccess.deviceStatusBlocked')}
                        </span>
                        {isCurrent && (
                          <span className='rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700'>
                            {t('ops.systemAccess.deviceCurrent')}
                          </span>
                        )}
                      </div>
                      <div className='mt-1 text-xs text-slate-500'>
                        {device.platform ?? '\u2014'} &middot;{' '}
                        <span title={device.userAgent ?? ''}>{shortUa(device.userAgent)}</span>
                      </div>
                      <div className='mt-1 text-xs text-slate-500'>
                        {t('ops.systemAccess.deviceLastSeen')}: {formatWhen(device.lastSeenAt)} &middot;{' '}
                        {t('ops.systemAccess.deviceLastIp')}: {device.lastIp ?? '\u2014'}
                      </div>
                      {device.status === 'BLOCKED' && device.blockReason && (
                        <div className='mt-1 text-xs text-red-600'>{device.blockReason}</div>
                      )}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <button
                        type='button'
                        onClick={() => {
                          setRenamingId(device.id);
                          setRenameValue(device.name);
                        }}
                        disabled={busy}
                        className='rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-60'
                      >
                        {t('ops.systemAccess.deviceRename')}
                      </button>
                      {device.status === 'ALLOWED' ? (
                        !managerCannotBlock && (
                          <button
                            type='button'
                            onClick={() => {
                              setBlockingId(device.id);
                              setBlockReason('');
                            }}
                            disabled={busy}
                            className='rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60'
                          >
                            {t('ops.systemAccess.deviceBlock')}
                          </button>
                        )
                      ) : (
                        <button
                          type='button'
                          onClick={() => setAccess(device, 'ALLOWED')}
                          disabled={busy}
                          className='rounded-lg border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60'
                        >
                          {t('ops.systemAccess.deviceAllow')}
                        </button>
                      )}
                    </div>
                  </div>

                  {renamingId === device.id && (
                    <div className='flex flex-wrap items-center gap-2'>
                      <input
                        className='min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
                        value={renameValue}
                        maxLength={60}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder={t('ops.systemAccess.deviceRename')}
                      />
                      <button
                        type='button'
                        onClick={() => saveRename(device)}
                        disabled={busy || renameValue.trim().length === 0}
                        className='rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-60'
                      >
                        {t('ops.systemAccess.deviceSave')}
                      </button>
                      <button
                        type='button'
                        onClick={() => setRenamingId(null)}
                        className='text-xs text-slate-600'
                      >
                        {t('action.cancel')}
                      </button>
                    </div>
                  )}

                  {blockingId === device.id && (
                    <div className='flex flex-wrap items-center gap-2'>
                      <input
                        className='min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
                        value={blockReason}
                        maxLength={200}
                        onChange={(e) => setBlockReason(e.target.value)}
                        placeholder={t('ops.systemAccess.deviceBlockReason')}
                      />
                      <button
                        type='button'
                        onClick={() => setAccess(device, 'BLOCKED')}
                        disabled={busy}
                        className='rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-60'
                      >
                        {t('ops.systemAccess.deviceConfirmBlock')}
                      </button>
                      <button
                        type='button'
                        onClick={() => setBlockingId(null)}
                        className='text-xs text-slate-600'
                      >
                        {t('action.cancel')}
                      </button>
                    </div>
                  )}

                  <div>
                    <div className='text-xs font-medium text-slate-600'>{t('ops.systemAccess.deviceActiveUsers')}</div>
                    <div className='mt-1 flex flex-wrap gap-1.5'>
                      {device.activeUsers.length === 0 && (
                        <span className='text-xs text-slate-400'>{'\u2014'}</span>
                      )}
                      {device.activeUsers.map((u) => (
                        <span key={u.id} className='rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700'>
                          {u.fullName} <span className='text-slate-400'>({u.role})</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <div className='text-xs font-medium text-slate-600'>{t('ops.systemAccess.deviceSessions')}</div>
                    {device.sessions.length === 0 && (
                      <div className='text-xs text-slate-400'>{t('ops.systemAccess.deviceNoSessions')}</div>
                    )}
                    {device.sessions.map(renderSession)}
                  </div>
                </div>
              );
            })}
          </div>

          {unregistered.length > 0 && (
            <div className='space-y-2 border-t border-slate-200 pt-3'>
              <div>
                <div className='text-sm font-medium text-slate-700'>{t('ops.systemAccess.deviceUnregisteredTitle')}</div>
                <p className='text-xs text-slate-500'>{t('ops.systemAccess.deviceUnregisteredBody')}</p>
              </div>
              <div className='space-y-2'>
                {unregistered.map(renderSession)}
              </div>
            </div>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
