'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { TextField, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError, API_BASE } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';

type SettingsResponse = { success: true; settings: Record<string, string> };
type MeResponse = { success: true; user: { id: string; role: string } };

export default function RestaurantSettingsPage() {
  const { t, tError } = useT();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoCacheBust, setLogoCacheBust] = useState(Date.now());
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoFlash, setLogoFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<SettingsResponse>(OPS_PATHS.settings),
      apiFetch<MeResponse>('/api/v1/auth/me'),
    ])
      .then(([sRes, meRes]) => {
        if (cancelled) return;
        setName(sRes.settings['restaurant.name'] ?? '');
        setHasLogo(!!(sRes.settings['restaurant.logoPath'] || ''));
        setCanEdit(meRes.user.role === 'OWNER');
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError) setErr({ code: e.code, message: e.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaved(false); setBusy(true);
    try {
      await apiFetch<SettingsResponse>(OPS_PATHS.settings, {
        method: 'PATCH',
        body: JSON.stringify({ settings: { 'restaurant.name': name.trim() } }),
      });
      setSaved(true);
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setBusy(false);
    }
  }

  const logoUrl = API_BASE + OPS_PATHS.settings + '/restaurant/logo?v=' + logoCacheBust;

  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null); setLogoFlash(null); setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(API_BASE + OPS_PATHS.settings + '/restaurant/logo', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        const code = typeof data.code === 'string' ? data.code : 'ERROR';
        const msg = typeof data.message === 'string' ? data.message : 'Upload failed.';
        throw new ApiError(res.status, code, msg);
      }
      setHasLogo(true);
      setLogoCacheBust(Date.now());
      setLogoFlash(t('ops.settings.restaurant.logoUploaded'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
      else setErr({ code: 'UPLOAD_FAILED', message: 'Upload failed.' });
    } finally {
      setLogoBusy(false);
    }
  }

  async function onLogoRemove() {
    setErr(null); setLogoFlash(null); setLogoBusy(true);
    try {
      await apiFetch(OPS_PATHS.settings + '/restaurant/logo', { method: 'DELETE' });
      setHasLogo(false);
      setLogoCacheBust(Date.now());
      setLogoFlash(t('ops.settings.restaurant.logoRemoved'));
    } catch (e2) {
      if (e2 instanceof ApiError) setErr({ code: e2.code, message: e2.message });
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.settings.restaurant.title')}
        subtitle={t('ops.settings.restaurant.subtitle')}
      />

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
        <>
        {logoFlash && (
          <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 max-w-2xl'>{logoFlash}</div>
        )}
        <section className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4 max-w-2xl'>
          <h2 className='text-sm font-medium text-slate-700'>{t('ops.settings.restaurant.logoHeading')}</h2>
          <div className='flex items-center gap-4'>
            <div className='w-24 h-24 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0'>
              {hasLogo ? (
                <img src={logoUrl} alt='logo' className='max-w-full max-h-full object-contain' />
              ) : (
                <span className='text-xs text-slate-400 px-2 text-center'>{t('ops.settings.restaurant.logoNone')}</span>
              )}
            </div>
            <div className='flex-1 space-y-2'>
              <p className='text-xs text-slate-500'>{t('ops.settings.restaurant.logoHint')}</p>
              {canEdit && (
                <div className='flex gap-2'>
                  <input
                    ref={fileInputRef}
                    type='file'
                    accept='image/png,image/jpeg,image/webp'
                    className='hidden'
                    onChange={onLogoSelected}
                  />
                  <button
                    type='button'
                    disabled={logoBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
                  >
                    {logoBusy ? t('ops.settings.restaurant.logoUploading') : t('ops.settings.restaurant.logoUpload')}
                  </button>
                  {hasLogo && (
                    <button
                      type='button'
                      disabled={logoBusy}
                      onClick={onLogoRemove}
                      className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60'
                    >
                      {t('ops.settings.restaurant.logoRemove')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4 max-w-2xl'>
          <TextField
            label={t('ops.settings.restaurant.nameLabel')}
            value={name}
            onChange={setName}
            disabled={!canEdit}
          />
          {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
          {saved && (
            <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
              {t('ops.settings.restaurant.saved')}
            </div>
          )}
          {canEdit && (
            <SubmitButton busy={busy}>{t('ops.settings.restaurant.save')}</SubmitButton>
          )}
        </form>
        </>
      )}
    </OpsShell>
  );
}
