'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export const REPORT_PAGE_SIZE = 100;

/**
 * URL-driven report pagination. The offset lives in the URL (like the
 * date filters), so the page's existing useReport re-fetches whenever
 * it changes, with no local state and no stale-query risk. Filter
 * changes drop `offset` automatically (see FilterBar / useReportFilters).
 */
export function usePagination() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const offset = Number(searchParams.get('offset') ?? '0');
  const limit = REPORT_PAGE_SIZE;

  const goToOffset = (nextOffset: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextOffset <= 0) next.delete('offset');
    else next.set('offset', String(nextOffset));
    router.push(`${pathname}?${next.toString()}`);
  };

  return { offset, limit, goToOffset };
}