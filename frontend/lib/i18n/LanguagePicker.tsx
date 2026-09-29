'use client';

import { useT } from './LanguageContext';

export function LanguagePicker() {
  const { lang, setLang } = useT();
  return (
    <div className='flex items-center gap-1 text-xs'>
      <button
        type='button'
        onClick={() => setLang('en')}
        aria-label='Switch to English'
        className={lang === 'en' ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-900'}
      >
        EN
      </button>
      <span className='text-slate-300'>|</span>
      <button
        type='button'
        onClick={() => setLang('sw')}
        aria-label='Switch to Swahili'
        className={lang === 'sw' ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-900'}
      >
        SW
      </button>
    </div>
  );
}
