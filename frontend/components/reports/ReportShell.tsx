'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  GitCompare,
  HandCoins,
  LayoutDashboard,
  Receipt,
  Scale,
  TrendingUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import { AppSidebar, type NavLink } from '@/components/ui/AppSidebar';
import { apiFetch, ApiError } from '@/lib/api';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

// Reports are readable by OWNER, MANAGER, and AUDITOR. WAITERs use the kiosk.
// This is a UX gate; the backend's requireRole remains authoritative.
const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER', 'AUDITOR']);

const LINKS: NavLink[] = [
  { href: '/dashboard',                   label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/reports/daily-sales',         label: 'Daily Sales',     icon: TrendingUp },
  { href: '/reports/reconciliations',     label: 'Reconciliations', icon: Scale },
  { href: '/reports/handovers',           label: 'Handovers',       icon: HandCoins },
  { href: '/reports/expenses',            label: 'Expenses',        icon: Receipt },
  { href: '/reports/supplier-balances',   label: 'Suppliers',       icon: Truck },
  { href: '/reports/sales-vs-pos',        label: 'Sales vs POS',    icon: GitCompare },
  { href: '/reports/stock-movements',     label: 'Stock Movements', icon: Warehouse },
];

export function ReportShell({ children }: { children: ReactNode }) {
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
          <p className="font-medium">You do not have permission to view reports.</p>
          <p className="text-sm mt-2">
            Reports are available to OWNER, MANAGER, and AUDITOR roles.
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
    <AppSidebar
      title="Reports"
      homeHref="/reports"
      links={LINKS}
      storageKey="reports-shell-collapsed"
      me={me}
    >
      {children}
    </AppSidebar>
  );
}