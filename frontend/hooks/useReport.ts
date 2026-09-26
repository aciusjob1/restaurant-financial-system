'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';

export type ReportState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready';   data: T;    error: null }
  | { status: 'error';   data: null; error: { status: number; code: string; message: string } };

/**
 * Fetches a report endpoint on the client, handling:
 *   - 401  → redirect to /login
 *   - other → render an error state
 *
 * Reports never re-fetch on the server; the existing frontend pattern is
 * client-side fetch with `credentials: 'include'` (see lib/api.ts).
 */
export function useReport<T>(path: string, query: string): ReportState<T> {
  const router = useRouter();
  const [state, setState] = useState<ReportState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    const url = query ? `${path}?${query}` : path;

    apiFetch<T>(url)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 401) {
            router.push('/login');
            return;
          }
          setState({
            status: 'error',
            data: null,
            error: { status: err.status, code: err.code, message: err.message },
          });
        } else {
          setState({
            status: 'error',
            data: null,
            error: { status: 500, code: 'UNKNOWN', message: 'Unable to load report.' },
          });
        }
      });

    return () => { cancelled = true; };
  }, [path, query, router]);

  return state;
}