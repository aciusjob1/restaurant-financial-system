'use client';

import { LanguagePicker } from '@/lib/i18n/LanguagePicker';
import { UserMenu } from '@/components/ops/UserMenu';

export function AppHeader({
  restaurantName,
  me,
}: {
  restaurantName: string;
  me: { fullName: string; role: string } | null;
}) {
  return (
    <div className='flex justify-between items-center gap-3 px-4 pt-4 min-h-[3.5rem]'>
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
  );
}
