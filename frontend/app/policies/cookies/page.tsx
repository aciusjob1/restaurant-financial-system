'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { useT } from '@/lib/i18n/LanguageContext';

export default function CookiePolicyPage() {
  const { t } = useT();

  const rows = [
    {
      name: 'rfs_session',
      purpose: t('cookies.session.purpose'),
      type: t('cookies.session.type'),
      duration: t('cookies.session.duration'),
    },
    {
      name: 'rfs_device',
      purpose: t('cookies.device.purpose'),
      type: t('cookies.device.type'),
      duration: t('cookies.device.duration'),
    },
    {
      name: 'rfs_lang',
      purpose: t('cookies.lang.purpose'),
      type: t('cookies.lang.type'),
      duration: t('cookies.lang.duration'),
    },
  ];

  return (
    <PublicShell>
      <div className='space-y-6'>
        <header>
          <Link
            href='/policies'
            className='inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900'
          >
            <ArrowLeft size={14} />
            {t('public.footer.policies')}
          </Link>
          <h1 className='mt-2 text-2xl font-semibold text-slate-900'>{t('cookies.title')}</h1>
          <p className='mt-1 text-sm text-slate-600'>{t('cookies.subtitle')}</p>
          <p className='mt-1 text-xs text-slate-400'>{t('policies.updated')}</p>
        </header>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-sm leading-6 text-slate-600'>{t('cookies.intro')}</p>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <div className='overflow-x-auto'>
            <table className='min-w-full text-left text-sm'>
              <thead>
                <tr className='border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500'>
                  <th className='py-2 pr-4 font-medium'>{t('cookies.table.cookie')}</th>
                  <th className='py-2 pr-4 font-medium'>{t('cookies.table.purpose')}</th>
                  <th className='py-2 pr-4 font-medium'>{t('cookies.table.type')}</th>
                  <th className='py-2 font-medium'>{t('cookies.table.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className='border-b border-slate-100 align-top last:border-0'>
                    <td className='py-3 pr-4 font-mono text-xs text-slate-900'>{row.name}</td>
                    <td className='py-3 pr-4 text-slate-600'>{row.purpose}</td>
                    <td className='py-3 pr-4 text-slate-600'>{row.type}</td>
                    <td className='py-3 text-slate-600'>{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <h2 className='text-sm font-semibold text-slate-800'>{t('cookies.manageTitle')}</h2>
          <p className='mt-2 text-sm leading-6 text-slate-600'>{t('cookies.manageBody')}</p>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <h2 className='text-sm font-semibold text-slate-800'>{t('cookies.contactTitle')}</h2>
          <p className='mt-2 text-sm leading-6 text-slate-600'>{t('cookies.contactBody')}</p>
          <Link
            href='/about'
            className='mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-900 underline'
          >
            {t('policies.contactLink')}
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
    </PublicShell>
  );
}
