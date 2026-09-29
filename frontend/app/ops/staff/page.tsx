'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type User = { id: string; isActive: boolean };
type Employee = { id: string; isActive: boolean };

export default function StaffHubPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [inactiveUsers, setInactiveUsers] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, empRes] = await Promise.all([
          apiFetch<{ success: true; users: User[] }>('/api/v1/users'),
          apiFetch<{ success: true; employees: Employee[] }>('/api/v1/employees'),
        ]);
        if (cancelled) return;
        setActiveUsers(usersRes.users.filter((u) => u.isActive).length);
        setInactiveUsers(usersRes.users.filter((u) => !u.isActive).length);
        setActiveEmployees(empRes.employees.filter((e) => e.isActive).length);
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ops = [
    { href: '/ops/employees', label: t('ops.staff.op.employees') },
    { href: '/ops/positions', label: t('ops.staff.op.positions') },
    { href: '/ops/users',     label: t('ops.staff.op.users') },
  ];

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.staff.title')}
        subtitle={t('ops.staff.subtitle')}
      />

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.status.heading')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.staff.stat.employees')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : activeEmployees}
            </div>
          </div>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.staff.stat.activeUsers')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : activeUsers}
            </div>
          </div>
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>
              {t('ops.staff.stat.inactiveUsers')}
            </div>
            <div className='mt-2 text-2xl font-mono text-slate-900'>
              {loading ? t('ops.hub.loading') : inactiveUsers}
            </div>
          </div>
        </div>
      </section>

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.next.heading')}
        </h2>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700'>
          {loading
            ? t('ops.hub.loading')
            : inactiveUsers > 0
              ? t('ops.staff.next.reviewInactive')
              : t('ops.hub.allCaughtUp')}
        </div>
      </section>

      <section className='space-y-3'>
        <h2 className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
          {t('ops.hub.operations.heading')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {ops.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className='rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm'
            >
              <div className='text-sm font-medium text-slate-900'>{o.label}</div>
            </Link>
          ))}
        </div>
      </section>
    </OpsShell>
  );
}
