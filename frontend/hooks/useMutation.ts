'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';

export type MutationState<T> =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; data: T }
  | { kind: 'error'; httpStatus: number; code: string; message: string };

/**
 * Form-submit hook. Mirrors the error contract of useReport:
 *   401  -> redirect to /login
 *   403  -> inline error (user is authenticated, not authorized)
 *   400/409/other -> inline error showing code + message
 *
 * Callers own the form state; this hook owns only the submit lifecycle.
 */
export function useMutation<TInput, TOutput>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  onSuccess?: (data: TOutput) => void
) {
  const router = useRouter();
  const [state, setState] = useState<MutationState<TOutput>>({ kind: 'idle' });

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  const submit = useCallback(
    async (input?: TInput): Promise<TOutput | undefined> => {
      setState({ kind: 'submitting' });
      try {
        const res = await apiFetch<TOutput>(path, {
          method,
          body: input === undefined ? undefined : JSON.stringify(input),
        });
        setState({ kind: 'success', data: res });
        onSuccess?.(res);
        return res;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            router.push('/login');
            return;
          }
          setState({
            kind: 'error',
            httpStatus: err.status,
            code: err.code,
            message: err.message,
          });
        } else {
          setState({
            kind: 'error',
            httpStatus: 500,
            code: 'UNKNOWN',
            message: 'Request failed.',
          });
        }
      }
    },
    [path, method, router, onSuccess]
  );

  return { state, submit, reset };
}