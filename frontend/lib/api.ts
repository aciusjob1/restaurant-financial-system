export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';

type Json = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfterSeconds?: number;
  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as Json) : {};

  if (!res.ok) {
    const code = typeof data.code === 'string' ? data.code : 'ERROR';
    const message = typeof data.message === 'string' ? data.message : 'Request failed.';
    // Read Retry-After (set by express-rate-limit when standardHeaders is on)
    // so callers can honour the server's lockout instead of inventing one.
    let retryAfterSeconds: number | undefined;
    const ra = res.headers.get('Retry-After');
    if (ra) {
      const n = parseInt(ra, 10);
      if (Number.isFinite(n) && n >= 0) retryAfterSeconds = n;
    }
    throw new ApiError(res.status, code, message, retryAfterSeconds);
  }
  return data as T;
}