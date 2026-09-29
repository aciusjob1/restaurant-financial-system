'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/LanguageContext';

export function LoadingState() {
  const { t } = useT();
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500'>
      {t('reports.state.loading')}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useT();
  const msg = message ?? t('reports.state.noData');
  return (
    <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500'>
      {msg}
    </div>
  );
}

export function ErrorState({ status, message }: { status: number; message: string }) {
  const { t } = useT();
  const isForbidden = status === 403;
  const heading = isForbidden ? t('reports.state.forbidden') : t('reports.state.unable');
  return (
    <div className='rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700'>
      <p className='font-medium'>{heading}</p>
      {!isForbidden && <p className='text-sm mt-1'>{message}</p>}
    </div>
  );
}

export function ReportHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className='flex items-start justify-between gap-4'>
      <div>
        <h1 className='text-2xl font-semibold text-slate-900'>{title}</h1>
        {subtitle && <p className='text-sm text-slate-500 mt-1'>{subtitle}</p>}
      </div>
      {actions && <div className='flex items-center gap-2'>{actions}</div>}
    </header>
  );
}
