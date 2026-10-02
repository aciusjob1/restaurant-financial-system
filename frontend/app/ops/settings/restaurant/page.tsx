'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { TextField, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<SettingsResponse>(OPS_PATHS.settings),
      apiFetch<MeResponse>('/api/v1/auth/me'),
    ])
      .then(([sRes, meRes]) => {
        if (cancelled) return;
        setName(sRes.settings['restaurant.name'] ?? '');
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

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.settings.restaurant.title')}
        subtitle={t('ops.settings.restaurant.subtitle')}
      />

      {loading ? (
        <div className='text-slate-500'>{t('common.loading')}</div>
      ) : (
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
      )}
    </OpsShell>
  );
}
