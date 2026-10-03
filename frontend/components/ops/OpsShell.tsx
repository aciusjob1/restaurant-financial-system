'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  UserCog,
  Users,
} from 'lucide-react';
import { AppSidebar, type NavLink } from '@/components/ui/AppSidebar';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import { useRestaurantName } from '@/hooks/useRestaurantName';
import { LanguagePicker } from '@/lib/i18n/LanguagePicker';
import { UserMenu } from '@/components/ops/UserMenu';
import type { Dict } from '@/lib/i18n/dictionaries';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER']);

type LinkSpec = { href: string; labelKey: keyof Dict; sectionKey?: keyof Dict; icon: NavLink['icon'] };

const LINKS: LinkSpec[] = [
  { href: '/dashboard',                labelKey: 'nav.dashboard',              icon: LayoutDashboard },

  // Money & Shift
  { href: '/ops/cash',                 labelKey: 'nav.ops.moneyShift',         sectionKey: 'nav.section.cash',           icon: Banknote },

  // Sales
  { href: '/ops/sales',                labelKey: 'nav.ops.sales',              sectionKey: 'nav.section.sales',          icon: ShoppingCart },

  // Purchasing & Inventory
  { href: '/ops/purchasing',           labelKey: 'nav.ops.purchasing',         sectionKey: 'nav.section.purchasing',     icon: Truck },
  { href: '/ops/inventory',            labelKey: 'nav.ops.inventory',          icon: Package },

  // Expenses
  { href: '/ops/expenses',             labelKey: 'nav.ops.expenses',           sectionKey: 'nav.section.expenses',       icon: Receipt },

  // Salaries
  { href: '/ops/salaries',             labelKey: 'nav.ops.salaries',           sectionKey: 'nav.section.salaries',       icon: Banknote },

  // Staff
  { href: '/ops/staff',                labelKey: 'nav.ops.staff',              sectionKey: 'nav.section.staff',          icon: UserRound },

  // Settings (bottom, ungrouped)
  { href: '/ops/settings',             labelKey: 'nav.ops.settings',           icon: UserCog },
];

export function OpsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useT();
  const restaurantName = useRestaurantName();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [denied, setDenied] = useState(false);

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
          <p className='font-medium'>{t('shell.deniedOps.title')}</p>
          <p className='text-sm mt-2'>{t('shell.deniedOps.body')}</p>
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
      title={t('shell.ops.title')}
      homeHref='/ops'
      links={links}
      storageKey='ops-shell-collapsed'
      me={me}
    >
      <div className='flex justify-between items-center gap-3 px-4 pt-4 min-h-[3rem]'>
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
      {children}
    </AppSidebar>
  );
}

export function OpsHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h1 className='text-2xl font-semibold text-slate-900'>{title}</h1>
      {subtitle && <p className='text-sm text-slate-500 mt-1'>{subtitle}</p>}
    </header>
  );
}
