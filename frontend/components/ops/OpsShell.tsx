'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Scale,
  ShoppingCart,
  Truck,
  UserRound,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

// Roles allowed to see the Operations UI at all. WAITERs and AUDITORs use
// /reports and /dashboard instead. This is a UX gate, not a security gate:
// the backend's requireRole on every /ops endpoint remains authoritative.
const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER']);

type NavLink = { href: string; label: string; icon: LucideIcon };

const LINKS: NavLink[] = [
  { href: '/ops/materials',           label: 'Materials',       icon: Package },
  { href: '/ops/material-categories', label: 'Categories',      icon: FolderTree },
  { href: '/ops/suppliers',           label: 'Suppliers',       icon: Truck },
  { href: '/ops/employees',           label: 'Employees',       icon: UserRound },
  { href: '/ops/positions',           label: 'Positions',       icon: Briefcase },
  { href: '/ops/purchase-invoices',   label: 'Invoices',        icon: FileText },
  { href: '/ops/supplier-payments',   label: 'Payments',        icon: CreditCard },
  { href: '/ops/stock-movements',     label: 'Stock',           icon: Warehouse },
  { href: '/ops/sales',               label: 'Sales',           icon: ShoppingCart },
  { href: '/ops/shifts',              label: 'Shifts',          icon: Clock },
  { href: '/ops/reconciliations',     label: 'Reconciliations', icon: Scale },
  { href: '/ops/handovers',           label: 'Handovers',       icon: HandCoins },
  { href: '/ops/expenses',            label: 'Expenses',        icon: Receipt },
  { href: '/ops/salaries',            label: 'Salaries',        icon: Banknote },
  { href: '/ops/daily-closing',       label: 'Closing',         icon: Lock },
];

const STORAGE_KEY = 'ops-shell-collapsed';

export function OpsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [denied, setDenied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Read persisted rail state once on mount (client only).
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist rail state, but only after the initial read has happened.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed, hydrated]);

  // Auth gate.
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

  // Auto-close the mobile drawer on route change.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Close drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch { /* fall through — always send the user to /login */ }
    router.push('/login');
  }

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

  const widthCls = collapsed ? 'lg:w-16' : 'lg:w-60';
  const padCls   = collapsed ? 'lg:pl-16' : 'lg:pl-60';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar — hidden on lg+ */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <Link href="/dashboard" className="font-medium text-slate-900 truncate">
            {me.fullName}
          </Link>
          <span className="ml-auto text-xs text-slate-500 shrink-0">{me.role}</span>
        </div>
      </div>

      {/* Backdrop for the mobile drawer */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-900/40 z-30"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col',
          'w-60',
          widthCls,
          'transition-[transform,width] duration-200 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Sidebar header */}
        <div className="flex items-center h-14 px-3 border-b border-slate-200">
          <Link
            href="/ops"
            className={[
              'font-medium text-slate-900 truncate',
              collapsed ? 'lg:hidden' : '',
            ].join(' ')}
          >
            Operations
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={[
              'hidden lg:inline-flex p-1.5 rounded-lg hover:bg-slate-100',
              collapsed ? 'mx-auto' : 'ml-auto',
            ].join(' ')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4 text-slate-600" />
              : <PanelLeftClose className="w-4 h-4 text-slate-600" />}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden ml-auto p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          <Link
            href="/dashboard"
            title={collapsed ? 'Dashboard' : undefined}
            className={[
              'flex items-center gap-3 mx-2 my-0.5 px-2 py-2 rounded-lg text-sm',
              'text-slate-700 hover:bg-slate-100',
              collapsed ? 'lg:justify-center lg:px-0' : '',
            ].join(' ')}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>Dashboard</span>
          </Link>

          {LINKS.map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href || (pathname?.startsWith(l.href + '/') ?? false);
            return (
              <Link
                key={l.href}
                href={l.href}
                title={collapsed ? l.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 mx-2 my-0.5 px-2 py-2 rounded-lg text-sm',
                  active
                    ? 'bg-slate-900 text-white hover:bg-slate-900'
                    : 'text-slate-700 hover:bg-slate-100',
                  collapsed ? 'lg:justify-center lg:px-0' : '',
                ].join(' ')}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className={collapsed ? 'lg:hidden' : ''}>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer: user + sign-out */}
        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className={['flex items-center gap-2', collapsed ? 'lg:hidden' : ''].join(' ')}>
            <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
              {me.fullName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-900 truncate">{me.fullName}</div>
              <div className="text-[10px] text-slate-500">{me.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title={collapsed ? 'Sign out' : undefined}
            className={[
              'flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm',
              'text-slate-700 hover:bg-slate-100 disabled:opacity-60',
              collapsed ? 'lg:justify-center lg:px-0' : '',
            ].join(' ')}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={['transition-[padding] duration-200', padCls].join(' ')}>
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">{children}</div>
      </main>
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