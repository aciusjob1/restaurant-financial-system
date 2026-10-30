'use client';

import Link from 'next/link';
import { Camera, Mail, MessageCircle } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { useT } from '@/lib/i18n/LanguageContext';

const OWNER_NAME = 'AIUS JOB MISSINGO';
const EMAIL = 'aciusjobi@gmail.com';
const INSTAGRAM_HANDLE = 'abson_acjo';

const WHATSAPP_NUMBERS = [
  { display: '0772 171 246', href: 'https://wa.me/255772171246' },
  { display: '0613 458 264', href: 'https://wa.me/255613458264' },
];

export default function AboutPage() {
  const { t } = useT();

  return (
    <PublicShell>
      <div className='space-y-6'>
        <header>
          <h1 className='text-2xl font-semibold text-slate-900'>{t('about.title')}</h1>
          <p className='mt-1 text-sm text-slate-600'>{t('about.subtitle')}</p>
        </header>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <h2 className='text-sm font-semibold text-slate-800'>{t('about.introTitle')}</h2>
          <p className='mt-2 text-sm leading-6 text-slate-600'>{t('about.introBody')}</p>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <h2 className='text-sm font-semibold text-slate-800'>{t('about.ownerTitle')}</h2>
          <p className='mt-3 text-lg font-semibold text-slate-900'>{OWNER_NAME}</p>
          <p className='text-xs uppercase tracking-wide text-slate-500'>{t('about.ownerRole')}</p>
          <p className='mt-3 text-sm text-slate-600'>{t('about.contactBody')}</p>

          <ul className='mt-4 space-y-2 text-sm'>
            {WHATSAPP_NUMBERS.map((number) => (
              <li key={number.href}>
                <a
                  href={number.href}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-2 text-slate-700 hover:text-slate-900'
                >
                  <MessageCircle size={16} className='text-emerald-600' />
                  <span>{t('about.whatsapp')}</span>
                  <span className='font-mono'>{number.display}</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href={'https://www.instagram.com/' + INSTAGRAM_HANDLE}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-2 text-slate-700 hover:text-slate-900'
              >
                <Camera size={16} className='text-pink-600' />
                <span>{t('about.instagram')}</span>
                <span className='font-mono'>@{INSTAGRAM_HANDLE}</span>
              </a>
            </li>
            <li>
              <a
                href={'mailto:' + EMAIL}
                className='inline-flex items-center gap-2 text-slate-700 hover:text-slate-900'
              >
                <Mail size={16} className='text-sky-600' />
                <span>{t('about.email')}</span>
                <span className='font-mono'>{EMAIL}</span>
              </a>
            </li>
          </ul>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <h2 className='text-sm font-semibold text-slate-800'>{t('about.policiesTitle')}</h2>
          <p className='mt-2 text-sm leading-6 text-slate-600'>{t('about.policiesBody')}</p>
          <div className='mt-4 flex flex-wrap gap-3'>
            <Link
              href='/policies'
              className='rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white'
            >
              {t('about.policiesLink')}
            </Link>
            <Link
              href='/policies/cookies'
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
            >
              {t('about.cookiesLink')}
            </Link>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
