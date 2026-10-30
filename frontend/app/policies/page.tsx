'use client';

import Link from 'next/link';
import { ArrowRight, Cookie } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { useT } from '@/lib/i18n/LanguageContext';

export default function PoliciesPage() {
  const { t } = useT();

  const sections = [
    { title: t('policies.privacyTitle'), body: t('policies.privacyBody') },
    { title: t('policies.securityTitle'), body: t('policies.securityBody') },
    { title: t('policies.termsTitle'), body: t('policies.termsBody') },
  ];

  return (
    <PublicShell>
      <div className='space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold text-slate-900'>{t('policies.title')}</h1>
          <p className='mt-1 text-sm text-slate-600'>{t('policies.subtitle')}</p>
          <p className='mt-1 text-xs text-slate-400'>{t('policies.updated')}</p>
        </header>

        {sections.map((section) => (
          <section key={section.title} className='rounded-2xl border border-slate-200 bg-white p-5'>
            <h2 className='text-sm font-semibold text-slate-800'>{section.title}</h2>
            <p className='mt-2 text-sm leading-6 text-slate-600'>{section.body}</p>
          </section>
        ))}

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <div className='flex items-start gap-3'>
            <span className='grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700'>
              <Cookie size={18} />
            </span>
            <div>
              <h2 className='text-sm font-semibold text-slate-800'>{t('policies.cookiesTitle')}</h2>
              <p className='mt-2 text-sm leading-6 text-slate-600'>{t('policies.cookiesBody')}</p>
              <Link
                href='/policies/cookies'
                className='mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-900 underline'
              >
                {t('policies.cookiesLink')}
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <h2 className='text-sm font-semibold text-slate-800'>{t('policies.contactTitle')}</h2>
          <p className='mt-2 text-sm leading-6 text-slate-600'>{t('policies.contactBody')}</p>
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
