'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { LanguagePicker } from '@/lib/i18n/LanguagePicker';
import styles from './page.module.css';

const PIN_LEN = 6;

type Status = 'idle' | 'busy' | 'locked' | 'success';

export default function PinLoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [shake, setShake] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick down the server lockout. We never invent a lockout duration —
  // if the server returns 429 without Retry-After, we fall back to a
  // conservative 1 second and the next request re-checks with the server.
  useEffect(() => {
    if (secondsLeft <= 0) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
          setStatus('idle');
          setErrorText(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [secondsLeft]);

  const submit = useCallback(
    async (candidate: string) => {
      if (candidate.length !== PIN_LEN) return;
      setStatus('busy');
      setErrorText(null);
      try {
        const res = await apiFetch<{ success: true; user: { role: string } }>(
          '/api/v1/auth/login-pin-only',
          { method: 'POST', body: JSON.stringify({ pin: candidate }) }
        );
        setStatus('success');
        router.push(res.user.role === 'WAITER' ? '/kiosk' : '/dashboard');
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          const secs = err.retryAfterSeconds ?? 1;
          setSecondsLeft(secs);
          setStatus('locked');
          setErrorText(t('login.pinLocked').replace('{seconds}', String(secs)));
          setPin('');
          return;
        }
        setShake(true);
        setErrorText(t('login.pinIncorrect'));
        setPin('');
        setStatus('idle');
        setTimeout(() => setShake(false), 500);
      }
    },
    [router, t]
  );

  const pressDigit = useCallback(
    (d: string) => {
      if (status !== 'idle') return;
      setPin((p) => {
        if (p.length >= PIN_LEN) return p;
        const next = p + d;
        if (next.length === PIN_LEN) {
          // Let state settle, then submit.
          setTimeout(() => submit(next), 0);
        }
        return next;
      });
    },
    [status, submit]
  );

  const back = useCallback(() => {
    if (status !== 'idle') return;
    setPin((p) => p.slice(0, -1));
  }, [status]);

  const clear = useCallback(() => {
    if (status !== 'idle') return;
    setPin('');
  }, [status]);

  // Physical keyboard support.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clear();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pressDigit, back, clear]);

  // Paste support: strip non-digits, take up to PIN_LEN.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (status !== 'idle') return;
      const text = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, PIN_LEN);
      if (!text) return;
      e.preventDefault();
      setPin(text);
      if (text.length === PIN_LEN) setTimeout(() => submit(text), 0);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [status, submit]);

  const layout: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const disabled = status !== 'idle';

  return (
    <main className={`min-h-screen flex items-center justify-center p-4 relative ${styles.safeArea}`}>
      <div className='absolute top-4 right-4'>
        <LanguagePicker />
      </div>

      <div className={`w-full max-w-sm bg-white rounded-3xl shadow-sm border border-slate-200 p-8 ${styles.card}`}>
        <h1 className='text-center text-xl font-semibold'>
          {status === 'success' ? t('login.pinSuccess') : t('login.pinHeading')}
        </h1>
        <p
          className={`text-center text-sm mt-1 mb-6 ${
            errorText ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {status === 'success'
            ? t('login.pinRedirecting')
            : errorText ?? t('login.pinWelcome')}
        </p>

        {status === 'success' ? (
          <div className='flex flex-col items-center py-6'>
            <svg viewBox='0 0 72 72' className='w-20 h-20'>
              <circle
                cx='36'
                cy='36'
                r='30'
                fill='none'
                stroke='#22c55e'
                strokeWidth='3'
                className={styles.checkCircle}
              />
              <path
                d='M23 37l9 9 17-19'
                fill='none'
                stroke='#22c55e'
                strokeWidth='3.5'
                strokeLinecap='round'
                strokeLinejoin='round'
                className={styles.checkPath}
              />
            </svg>
          </div>
        ) : (
          <>
            <div
              className={`flex justify-center gap-4 mb-7 ${shake ? styles.dotsShake : ''}`}
              aria-hidden='true'
            >
              {Array.from({ length: PIN_LEN }).map((_, i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border ${
                    i < pin.length
                      ? 'bg-slate-900 border-slate-900'
                      : 'bg-transparent border-slate-300'
                  } ${styles.dot}`}
                />
              ))}
            </div>

            <div className='grid grid-cols-3 gap-3 max-w-[280px] mx-auto'>
              {layout.map((k, idx) => {
                if (k === '') {
                  return <div key={idx} />;
                }
                if (k === 'del') {
                  return (
                    <button
                      key={idx}
                      type='button'
                      onClick={back}
                      disabled={disabled}
                      aria-label='Delete'
                      className={`aspect-[5/4] rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium transition-transform disabled:opacity-40 ${styles.keyHit}`}
                    >
                      ⌫
                    </button>
                  );
                }
                return (
                  <button
                    key={idx}
                    type='button'
                    onClick={() => pressDigit(k)}
                    disabled={disabled}
                    className={`aspect-[5/4] rounded-2xl border border-slate-200 bg-white text-slate-900 text-2xl font-medium transition-transform disabled:opacity-40 ${styles.keyHit}`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className='mt-6 text-center'>
          <button
            type='button'
            onClick={() => router.push('/login')}
            className='text-sm text-slate-500 hover:text-slate-800 underline'
          >
            {t('login.pinBackToPassword')}
          </button>
        </div>
      </div>
    </main>
  );
}