'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

// Roles allowed to see the Operations UI at all. WAITERs and AUDITORs use
// /reports and /dashboard instead. This is a UX gate, not a security gate:
// the backend's requireRole on every /ops endpoint remains authoritative.
const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER']);

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/ops/materials', label: 'Materials' },
  { href: '/ops/material-categories', label: 'Categories' },
  { href: '/ops/suppliers', label: 'Suppliers' },
  { href: '/ops/employees', label: 'Employees' },
  { href: '/ops/positions', label: 'Positions' },
  { href: '/ops/purchase-invoices', label: 'Invoices' },
  { href: '/ops/supplier-payments', label: 'Payments' },
  { href: '/ops/stock-movements', label: 'Stock' },
  { href: '/ops/sales', label: 'Sales' },
  { href: '/ops/shifts', label: 'Shifts' },
  { href: '/ops/reconciliations', label: 'Reconciliations' },
  { href: '/ops/handovers', label: 'Handovers' },
  { href: '/ops/expenses', label: 'Expenses' },
  { href: '/ops/salaries', label: 'Salaries' },
  { href: '/ops/daily-closing', label: 'Closing' },
];

export function OpsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
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

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="font-medium">You do not have permission to access Operations.</p>
          <p className="text-sm mt-2">
            This area is available to OWNER and MANAGER roles.
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
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
            ← Dashboard
          </Link>
          <Link href="/ops" className="text-sm font-medium text-slate-900">
            Ops
          </Link>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-slate-500">
            {me.fullName} — {me.role}
          </span>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">{children}</main>
    </div>
  );
}

export function OpsHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </header>
  );
}