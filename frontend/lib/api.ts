const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

type Json = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
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
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}