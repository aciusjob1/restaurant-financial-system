'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

/**
 * URL-driven report filter helpers. Both the FilterBar's date inputs and the
 * SelectFilter dropdowns (and any page-specific controls) share this hook.
 *
 * Changing a filter pushes a new URL. The page reads searchParams via
 * useSearchParams() and re-derives its API query — no client-side filter
 * state, no stale dropdowns.
 */
export function useReportFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getParam = useCallback(
    (key: string): string | null => searchParams.get(key),
    [searchParams]
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return { getParam, setParam };
}