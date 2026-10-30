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
import { LanguagePicker } from '@/lib/i18n/LanguagePicker';
import { UserMenu } from '@/components/ops/UserMenu';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { useRestaurantName } from '@/hooks/useRestaurantName';
import { PrintHeader, PrintFooter } from './PrintChrome';
import type { Dict } from '@/lib/i18n/dictionaries';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER', 'AUDITOR']);

type LinkSpec = { href: string; labelKey: keyof Dict; sectionKey?: keyof Dict; icon: NavLink['icon'] };

const LINKS: LinkSpec[] = [
  { href: '/dashboard',                   labelKey: 'nav.dashboard',                  icon: LayoutDashboard },

  // Cash
  { href: '/reports/daily-sales',         labelKey: 'nav.reports.dailySales',         sectionKey: 'nav.section.reports.cash',       icon: TrendingUp },
  { href: '/reports/reconciliations',     labelKey: 'nav.reports.reconciliations',    icon: Scale },
  { href: '/reports/handovers',           labelKey: 'nav.reports.handovers',          icon: HandCoins },

  // Financial
  { href: '/reports/expenses',            labelKey: 'nav.reports.expenses',           sectionKey: 'nav.section.financial',          icon: Receipt },
  { href: '/reports/supplier-balances',   labelKey: 'nav.reports.supplierBalances',   icon: Truck },

  // Inventory
  { href: '/reports/sales-vs-pos',        labelKey: 'nav.reports.salesVsPos',         sectionKey: 'nav.section.reports.inventory',  icon: GitCompare },
  { href: '/reports/stock-movements',     labelKey: 'nav.reports.stockMovements',     icon: Warehouse },
];

export function ReportShell({
  children,
  printTitle,
  printPeriod,
}: {
  children: ReactNode;
  printTitle?: string;
  printPeriod?: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [denied, setDenied] = useState(false);
  const restaurantName = useRestaurantName();

  const links = useMemo<NavLink[]>(
    () => LINKS.map((l) => ({ href: l.href, label: t(l.labelKey), section: l.sectionKey ? t(l.sectionKey) : undefined, icon: l.icon })),
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
      <div className='flex justify-between items-center gap-3 px-4 pt-4 print:hidden min-h-[3rem]'>
        {restaurantName && (
          <div className='text-base font-semibold uppercase tracking-[0.16em] text-slate-600 truncate'>
            {restaurantName}
          </div>
        )}
        <div className='flex items-center gap-3 shrink-0'>
          <LanguagePicker />
          {me && <UserMenu fullName={me.fullName} role={me.role} />}
        </div>
      </div>

      {printTitle && (
        <div className='flex justify-end px-4 print:hidden'>
          <button
            type='button'
            onClick={() => window.print()}
            className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
          >
            {t('print.printButton')}
          </button>
        </div>
      )}
      {printTitle && (
        <PrintHeader
          title={printTitle}
          generatedBy={me.fullName}
          generatedByRole={me.role}
          period={printPeriod}
        />
      )}
      <div className='print:px-0'>
        {children}
      </div>
      <PrintFooter />
    </AppSidebar>
  );
}
