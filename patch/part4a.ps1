# RFS System Access UI patch — part 4a/4 (page component)
$pageText = @"
'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
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

export default function SystemAccessPage() {
  const { t } = useT();
  const [status, setStatus] = useState<Status>('checking');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confident, setConfident] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

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

  useEffect(() => { void check(); }, [check]);

  const primary = candidates.find((c) => !c.likelyVirtual) ?? candidates[0];
  const url = primary ? protocol + '//' + primary.address + (webPort ? ':' + webPort : '') : '';

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

  const statusLabel = status === 'connected' ? 'ops.systemAccess.connected'
    : status === 'unavailable' ? 'ops.systemAccess.unavailable'
    : status === 'signedout' ? 'ops.systemAccess.sessionExpiredLabel'
    : status === 'forbidden' ? 'ops.systemAccess.permissionDeniedLabel'
    : status === 'error' ? 'ops.systemAccess.error'
    : 'ops.systemAccess.checking';

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
      </div>
    </OpsShell>
  );
}
"@