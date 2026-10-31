'use client';

import Link from 'next/link';
import {
  Banknote,
  Camera,
  Clock,
  FileText,
  Lock,
  Mail,
  MessageCircle,
  Receipt,
  Scale,
  ShoppingCart,
  Users,
  Warehouse,
} from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

const OWNER_NAME = 'Acius Job Missingo';
const EMAIL = 'aciusjob1@gmail.com';
const INSTAGRAM_HANDLE = 'abson_acjo';

const WHATSAPP_NUMBERS = [
  { display: '0772 171 246', href: 'https://wa.me/255772171246' },
  { display: '0613 458 264', href: 'https://wa.me/255613458264' },
];

const FEATURES: { icon: typeof Banknote; title: keyof Dict; body: keyof Dict }[] = [
  { icon: Banknote, title: 'about.flow.sales.title', body: 'about.flow.sales.body' },
  { icon: Scale, title: 'about.flow.cash.title', body: 'about.flow.cash.body' },
  { icon: ShoppingCart, title: 'about.flow.purchasing.title', body: 'about.flow.purchasing.body' },
  { icon: Warehouse, title: 'about.flow.inventory.title', body: 'about.flow.inventory.body' },
  { icon: Receipt, title: 'about.flow.expenses.title', body: 'about.flow.expenses.body' },
  { icon: Users, title: 'about.flow.staff.title', body: 'about.flow.staff.body' },
  { icon: FileText, title: 'about.flow.reports.title', body: 'about.flow.reports.body' },
  { icon: Lock, title: 'about.flow.access.title', body: 'about.flow.access.body' },
];

const DAY_STEPS: { title: keyof Dict; body: keyof Dict }[] = [
  { title: 'about.example.step1Title', body: 'about.example.step1Body' },
  { title: 'about.example.step2Title', body: 'about.example.step2Body' },
  { title: 'about.example.step3Title', body: 'about.example.step3Body' },
  { title: 'about.example.step4Title', body: 'about.example.step4Body' },
  { title: 'about.example.step5Title', body: 'about.example.step5Body' },
  { title: 'about.example.step6Title', body: 'about.example.step6Body' },
];

export default function AboutPage() {
  const { t } = useT();

  return (
    <PublicShell>
      <div className='space-y-10'>
        <header>
          <h1 className='text-3xl font-semibold tracking-tight text-slate-900'>{t('about.title')}</h1>
          <p className='mt-3 max-w-2xl text-base leading-7 text-slate-600'>{t('about.subtitle')}</p>
        </header>

        <section className='rounded-2xl border border-slate-200 bg-white p-6'>
          <h2 className='text-lg font-semibold text-slate-900'>{t('about.introTitle')}</h2>
          <p className='mt-3 text-sm leading-7 text-slate-700'>{t('about.introBody')}</p>
        </section>

        <section>
          <h2 className='text-lg font-semibold text-slate-900'>{t('about.flowTitle')}</h2>
          <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className='rounded-2xl border border-slate-200 bg-white p-5'>
                <div className='flex items-center gap-3'>
                  <span className='grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600'>
                    <Icon size={18} />
                  </span>
                  <h3 className='text-base font-semibold text-slate-900'>{t(title)}</h3>
                </div>
                <p className='mt-3 text-sm leading-6 text-slate-700'>{t(body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-6'>
          <div className='flex items-center gap-2'>
            <Clock size={18} className='text-slate-500' />
            <h2 className='text-lg font-semibold text-slate-900'>{t('about.exampleTitle')}</h2>
          </div>
          <p className='mt-2 text-sm text-slate-600'>{t('about.exampleIntro')}</p>
          <ol className='mt-5 space-y-5'>
            {DAY_STEPS.map((step, i) => (
              <li key={step.title} className='flex gap-4'>
                <span className='grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white'>
                  {i + 1}
                </span>
                <div>
                  <h3 className='text-sm font-semibold text-slate-900'>{t(step.title)}</h3>
                  <p className='mt-1 text-sm leading-6 text-slate-700'>{t(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className='mt-6 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600'>
            {t('about.exampleNote')}
          </p>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-6'>
          <h2 className='text-lg font-semibold text-slate-900'>{t('about.whoTitle')}</h2>
          <p className='mt-3 text-sm leading-7 text-slate-700'>{t('about.whoBody')}</p>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-6'>
          <h2 className='text-lg font-semibold text-slate-900'>{t('about.ownerTitle')}</h2>
          <p className='mt-3 text-xl font-semibold text-slate-900'>{OWNER_NAME}</p>
          <p className='text-xs uppercase tracking-wide text-slate-500'>{t('about.ownerRole')}</p>
          <p className='mt-3 text-sm leading-7 text-slate-700'>{t('about.contactBody')}</p>

          <ul className='mt-4 space-y-2 text-sm'>
            {WHATSAPP_NUMBERS.map((number) => (
              <li key={number.href}>
                <a
                  href={number.href}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-2 text-slate-700 hover:text-slate-900'
                >
                  <MessageCircle size={16} className='text-slate-500' />
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
                <Camera size={16} className='text-slate-500' />
                <span>{t('about.instagram')}</span>
                <span className='font-mono'>@{INSTAGRAM_HANDLE}</span>
              </a>
            </li>
            <li>
              <a
                href={'mailto:' + EMAIL}
                className='inline-flex items-center gap-2 text-slate-700 hover:text-slate-900'
              >
                <Mail size={16} className='text-slate-500' />
                <span>{t('about.email')}</span>
                <span className='font-mono'>{EMAIL}</span>
              </a>
            </li>
          </ul>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-6'>
          <h2 className='text-lg font-semibold text-slate-900'>{t('about.policiesTitle')}</h2>
          <p className='mt-3 text-sm leading-7 text-slate-700'>{t('about.policiesBody')}</p>
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
