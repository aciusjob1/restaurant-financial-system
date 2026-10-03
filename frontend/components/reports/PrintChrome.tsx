'use client';

import { useEffect, useState } from 'react';
import { API_BASE, apiFetch } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';
import { useT } from '@/lib/i18n/LanguageContext';

type SettingsResponse = { success: true; settings: Record<string, string> };

// Print-only header rendered above every report body. Hidden on screen,
// visible on print. Loads restaurant identity once per page load.
//
// Honest simplification: 'Generated at' and 'Printed at' are both
// computed at the moment the component mounts, which is close enough to
// the print click. A report that has been open for hours will show a
// 'Generated at' that matches when the page was opened, not when the
// print button was clicked. This is a v1 simplification — a real
// generated/printed distinction needs the report data to carry its own
// generation timestamp.
export function PrintHeader({
  title,
  generatedBy,
  generatedByRole,
  period,
}: {
  title: string;
  generatedBy: string;
  generatedByRole: string;
  period?: string;
}) {
  const { t } = useT();
  const [restaurantName, setRestaurantName] = useState('');
  const [hasLogo, setHasLogo] = useState(false);
  const [stamp] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    apiFetch<SettingsResponse>(OPS_PATHS.settings)
      .then((res) => {
        if (cancelled) return;
        setRestaurantName(res.settings['restaurant.name'] ?? '');
        setHasLogo(!!(res.settings['restaurant.logoPath'] || ''));
      })
      .catch(() => { /* non-fatal for print */ });
    return () => { cancelled = true; };
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const y = stamp.getFullYear();
  const mo = pad(stamp.getMonth() + 1);
  const d = pad(stamp.getDate());
  const h = pad(stamp.getHours());
  const mi = pad(stamp.getMinutes());
  const s = pad(stamp.getSeconds());
  const reportId = 'RPT-' + y + mo + d + '-' + h + mi + s;
  const whenStr = d + ' ' + mo + ' ' + y + ' ' + h + ':' + mi;

  return (
    <div className='hidden print:block mb-6'>
      <div className='flex items-start gap-4 border-b border-slate-300 pb-4'>
        {hasLogo && (
          <img
            src={API_BASE + OPS_PATHS.settings + '/restaurant/logo'}
            alt='logo'
            className='w-16 h-16 object-contain shrink-0'
          />
        )}
        <div className='flex-1'>
          {restaurantName && (
            <div className='text-lg font-semibold text-slate-900'>{restaurantName}</div>
          )}
          <div className='text-sm text-slate-700 mt-2 font-medium'>{title}</div>
          {period && <div className='text-xs text-slate-600 mt-0.5'>{period}</div>}
        </div>
        <div className='text-xs text-slate-600 text-right space-y-0.5'>
          <div>{t('print.reportId')}: {reportId}</div>
        </div>
      </div>

      <div className='flex justify-between gap-4 text-xs text-slate-600 pt-2 pb-1'>
        <div className='space-y-0.5'>
          <div>{t('print.generatedBy')}: {generatedBy} ({generatedByRole})</div>
        </div>
        <div className='space-y-0.5 text-right'>
          <div>{t('print.generatedAt')}: {whenStr}</div>
          <div>{t('print.printedAt')}: {whenStr}</div>
        </div>
      </div>
    </div>
  );
}

export function PrintFooter() {
  const { t } = useT();
  return (
    <div className='hidden print:block mt-8 pt-3 border-t border-slate-300 text-xs text-slate-500'>
      <div className='flex justify-between gap-4'>
        <span>{t('print.confidential')}</span>
        <span>{t('print.systemName')}</span>
      </div>
    </div>
  );
}
