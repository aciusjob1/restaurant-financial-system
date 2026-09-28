'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Banknote,
  Briefcase,
  Clock,
  CreditCard,
  FileText,
  FolderTree,
  HandCoins,
  LayoutDashboard,
  Lock,
  Package,
  Receipt,
  Scale,
  Tags,
  ShoppingCart,
  Truck,
  UserRound,
  Warehouse,
  Coins,
} from 'lucide-react';
import { AppSidebar, type NavLink } from '@/components/ui/AppSidebar';
import { apiFetch, ApiError } from '@/lib/api';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

// Roles allowed to see the Operations UI at all. WAITERs and AUDITORs use
// /reports and /dashboard instead. This is a UX gate, not a security gate:
// the backend's requireRole on every /ops endpoint remains authoritative.
const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER']);

const LINKS: NavLink[] = [
  { href: '/dashboard',                label: 'Dashboard',          icon: LayoutDashboard },
  { href: '/ops/materials',            label: 'Materials',          icon: Package },
  { href: '/ops/material-categories',  label: 'Categories',         icon: FolderTree },
  { href: '/ops/expense-categories',   label: 'Expense Categories', icon: Tags },
  { href: '/ops/suppliers',            label: 'Suppliers',          icon: Truck },
  { href: '/ops/employees',            label: 'Employees',          icon: UserRound },
  { href: '/ops/positions',            label: 'Positions',          icon: Briefcase },
  { href: '/ops/purchase-invoices',    label: 'Invoices',           icon: FileText },
  { href: '/ops/supplier-payments',    label: 'Payments',           icon: CreditCard },
  { href: '/ops/stock-movements',      label: 'Stock',              icon: Warehouse },
  { href: '/ops/sales',                label: 'Sales',              icon: ShoppingCart },
  { href: '/ops/shifts',               label: 'Shifts',             icon: Clock },
  { href: '/ops/reconciliations',      label: 'Reconciliations',    icon: Scale },
  { href: '/ops/collections',          label: 'Collections',        icon: Coins },
  { href: '/ops/handovers',            label: 'Handovers',          icon: HandCoins },
  { href: '/ops/expenses',             label: 'Expenses',           icon: Receipt },
  { href: '/ops/salaries',             label: 'Salaries',           icon: Banknote },
  { href: '/ops/daily-closing',        label: 'Closing',            icon: Lock },
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
    <AppSidebar
      title="Operations"
      homeHref="/ops"
      links={LINKS}
      storageKey="ops-shell-collapsed"
      me={me}
    >
      {children}
    </AppSidebar>
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
