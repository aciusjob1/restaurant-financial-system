'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER', 'AUDITOR']);

type LinkSpec = { href: string; labelKey: keyof Dict; icon: NavLink['icon'] };

const LINKS: LinkSpec[] = [
  { href: '/dashboard',                   labelKey: 'nav.dashboard',                  icon: LayoutDashboard },
  { href: '/reports/daily-sales',         labelKey: 'nav.reports.dailySales',         icon: TrendingUp },
  { href: '/reports/reconciliations',     labelKey: 'nav.reports.reconciliations',    icon: Scale },
  { href: '/reports/handovers',           labelKey: 'nav.reports.handovers',          icon: HandCoins },
  { href: '/reports/expenses',            labelKey: 'nav.reports.expenses',           icon: Receipt },
  { href: '/reports/supplier-balances',   labelKey: 'nav.reports.supplierBalances',   icon: Truck },
  { href: '/reports/sales-vs-pos',        labelKey: 'nav.reports.salesVsPos',         icon: GitCompare },
  { href: '/reports/stock-movements',     labelKey: 'nav.reports.stockMovements',     icon: Warehouse },
];

export function ReportShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useT();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [denied, setDenied] = useState(false);

  const links = useMemo<NavLink[]>(
    () => LINKS.map((l) => ({ href: l.href, label: t(l.labelKey), icon: l.icon })),
    [t]
  );

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
      <div className='min-h-screen flex items-center justify-center p-6 bg-slate-50'>
        <div className='max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700'>
          <p className='font-medium'>{t('shell.deniedReports.title')}</p>
          <p className='text-sm mt-2'>{t('shell.deniedReports.body')}</p>
          <Link
            href='/dashboard'
            className='mt-4 inline-block rounded-lg bg-slate-900 text-white px-4 py-2 text-sm'
          >
            {t('shell.returnToDashboard')}
          </Link>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className='min-h-screen flex items-center justify-center p-6 bg-slate-50'>
        <div className='text-slate-500'>{t('shell.checkingAccess')}</div>
      </div>
    );
  }

  return (
    <AppSidebar
      title={t('shell.reports.title')}
      homeHref='/reports'
      links={links}
      storageKey='reports-shell-collapsed'
      me={me}
    >
      {children}
    </AppSidebar>
  );
}
