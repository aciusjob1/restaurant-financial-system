'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { LanguagePicker } from '@/lib/i18n/LanguagePicker';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await apiFetch<{ success: true; user: { role: string } }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      router.push(res.user.role === 'WAITER' ? '/kiosk' : '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.errorFallback'));
    } finally { setBusy(false); }
  }

  return (
    <main className='min-h-screen flex items-center justify-center p-6 relative'>
      <div className='absolute top-4 right-4'>
        <LanguagePicker />
      </div>
      <form onSubmit={onSubmit}
            className='w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4'>
        <div>
          <h1 className='text-xl font-semibold'>{t('login.heading')}</h1>
          <p className='text-sm text-slate-500'>{t('login.subtitle')}</p>
        </div>

        {error && (
          <div className='text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2'>
            {error}
          </div>
        )}

        <label className='block'>
          <span className='text-sm font-medium'>{t('login.username')}</span>
          <input className='mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none'
                 value={username} onChange={(e) => setUsername(e.target.value)}
                 autoComplete='username' required />
        </label>

        <div className='block'>
          <label htmlFor='login-password' className='text-sm font-medium'>{t('login.password')}</label>
          <div className='relative'>
            <input id='login-password' type={showPassword ? 'text' : 'password'}
                   className='mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 outline-none'
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   autoComplete='current-password' required />
            <button
              type='button'
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              tabIndex={-1}
              className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800'
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button type='submit' disabled={busy}
                className='w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-60'>
          {busy ? t('login.submitting') : t('login.submit')}
        </button>

        <button type='button' onClick={() => router.push('/login/pin')}
                className='w-full text-sm text-slate-500 hover:text-slate-800 underline'>
          {t('login.pinToggle')}
        </button>
      </form>
    </main>
  );
}