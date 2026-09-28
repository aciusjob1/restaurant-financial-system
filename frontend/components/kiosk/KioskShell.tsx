'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

// The kiosk is WAITER-only. The backend enforces this on every endpoint
// the kiosk calls; this gate is purely UX.
const ALLOWED_ROLES = new Set(['WAITER']);

export function KioskShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>('/api/v1/auth/me')
      .then((res) => {
        if (cancelled) return;
        if (!ALLOWED_ROLES.has(res.user.role)) setDenied(true);
        else setMe(res.user);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.push('/login');
        else setDenied(true);
      });
    return () => { cancelled = true; };
  }, [router]);

  async function logout() {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  }

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <p className="font-medium">This is the waiter kiosk.</p>
          <p className="text-sm mt-2">
            Your role does not use this interface. Ask a manager for access to Operations.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block rounded-lg bg-slate-900 text-white px-4 py-2 text-sm"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-slate-500">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-4">
          <nav className="flex items-center gap-3">
            <Link
              href="/kiosk"
              className={'text-sm ' + (pathname === '/kiosk' ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-900')}
            >
              Shift
            </Link>
            <Link
              href="/kiosk/expenses"
              className={'text-sm ' + (pathname.startsWith('/kiosk/expenses') ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-900')}
            >
              Expenses
            </Link>
          </nav>
          <span className="ml-auto text-xs text-slate-500">
            {me.fullName} — {me.role}
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">{children}</main>
    </div>
  );
}

export function KioskHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </header>
  );
}